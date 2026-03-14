import type * as utils from "@iobroker/adapter-core";
import type {
	F1WeatherData,
	F1SessionStatus,
	F1TrackStatus,
	F1LapCount,
	F1SessionInfo,
	F1TimingData,
	F1TimingAppData,
	F1PitStopSeries,
	F1TeamRadio,
	F1RaceControlMessages,
	F1ChampionshipPrediction,
	F1DriverList,
} from "./types.js";

const STATIC_BASE = "https://livetiming.formula1.com/static/";

// Deep-merge utility for partial SignalR diff payloads
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = { ...target };
	for (const key of Object.keys(source)) {
		const src = source[key];
		const tgt = result[key];
		if (
			src !== null &&
			typeof src === "object" &&
			!Array.isArray(src) &&
			typeof tgt === "object" &&
			tgt !== null &&
			!Array.isArray(tgt)
		) {
			result[key] = deepMerge(tgt as Record<string, unknown>, src as Record<string, unknown>);
		} else if (src !== undefined) {
			result[key] = src;
		}
	}
	return result;
}

export class StateMapper {
	// In-memory diff state
	private timingState: Record<string, Record<string, unknown>> = {};
	private timingAppState: Record<string, Record<string, unknown>> = {};
	private pitState: Record<string, Record<string, unknown>> = {};
	private rcMessages: Record<string, unknown> = {};
	private driverList: F1DriverList = {};
	private radioCaptures: Array<{ utc: string; driver_number: string; url: string }> = [];
	private prevPositions: Record<string, number> = {};
	private overtakes: Array<{ utc: string; overtaking: string; overtaken: string; position: number }> = [];

	reset(): void {
		this.timingState = {};
		this.timingAppState = {};
		this.pitState = {};
		this.rcMessages = {};
		this.driverList = {};
		this.radioCaptures = [];
		this.prevPositions = {};
		this.overtakes = [];
	}

	async handle(adapter: utils.AdapterInstance, topic: string, data: unknown, timestamp: string): Promise<void> {
		try {
			switch (topic) {
				case "WeatherData":
					await this.handleWeather(adapter, data as Partial<F1WeatherData>);
					break;
				case "SessionStatus":
					await this.handleSessionStatus(adapter, data as Partial<F1SessionStatus>);
					break;
				case "TrackStatus":
					await this.handleTrackStatus(adapter, data as Partial<F1TrackStatus>);
					break;
				case "LapCount":
					await this.handleLapCount(adapter, data as Partial<F1LapCount>);
					break;
				case "SessionInfo":
					await this.handleSessionInfo(adapter, data as Partial<F1SessionInfo>);
					break;
				case "DriverList":
					this.handleDriverList(data as Partial<F1DriverList>);
					break;
				case "TimingData":
					await this.handleTimingData(adapter, data as Partial<F1TimingData>, timestamp);
					break;
				case "TimingAppData":
					await this.handleTimingAppData(adapter, data as Partial<F1TimingAppData>);
					break;
				case "PitStopSeries":
					await this.handlePitStops(adapter, data as Partial<F1PitStopSeries>);
					break;
				case "TeamRadio":
					await this.handleTeamRadio(adapter, data as Partial<F1TeamRadio>);
					break;
				case "RaceControlMessages":
					await this.handleRaceControl(adapter, data as Partial<F1RaceControlMessages>);
					break;
				case "ChampionshipPrediction":
					await this.handleChampionship(adapter, data as Partial<F1ChampionshipPrediction>);
					break;
				default:
					// Heartbeat, ExtrapolatedClock, TopThree, SessionData, TyreStintSeries, DriverRaceInfo — watchdog handled in SignalRClient
					break;
			}
		} catch (err) {
			adapter.log.debug(`StateMapper [${topic}]: ${(err as Error).message}`);
		}
	}

	// ----------------------------------------------------------------

	private async handleWeather(adapter: utils.AdapterInstance, data: Partial<F1WeatherData>): Promise<void> {
		if (!data || !Object.keys(data).length) return;
		const weather = {
			air_temperature: parseFloat(data.AirTemp ?? "0"),
			humidity: parseFloat(data.Humidity ?? "0"),
			pressure: parseFloat(data.Pressure ?? "0"),
			rainfall: parseFloat(data.Rainfall ?? "0"),
			track_temperature: parseFloat(data.TrackTemp ?? "0"),
			wind_direction: parseFloat(data.WindDirection ?? "0"),
			wind_speed: parseFloat(data.WindSpeed ?? "0"),
		};
		await adapter.setStateAsync("live_session.weather", { val: JSON.stringify(weather, null, 2), ack: true });
	}

	private async handleSessionStatus(adapter: utils.AdapterInstance, data: Partial<F1SessionStatus>): Promise<void> {
		if (!data?.Status) return;
		const statusMap: Record<string, string> = {
			Started: "active",
			Finished: "finished",
			Aborted: "finished",
			Ends: "finished",
			Inactive: "no_session",
		};
		const val = statusMap[data.Status] ?? data.Status;
		await adapter.setStateAsync("live_session.status", { val, ack: true });
		adapter.log.info(`Session status: ${data.Status} → ${val}`);
	}

	private async handleTrackStatus(adapter: utils.AdapterInstance, data: Partial<F1TrackStatus>): Promise<void> {
		if (!data?.Message) return;
		await adapter.setStateAsync("live_session.track_status", { val: data.Message, ack: true });
	}

	private async handleLapCount(adapter: utils.AdapterInstance, data: Partial<F1LapCount>): Promise<void> {
		const total = data?.TotalLaps ?? data?.CurrentLap;
		if (total !== undefined) {
			await adapter.setStateAsync("live_session.laps_total", { val: total, ack: true });
		}
	}

	private async handleSessionInfo(adapter: utils.AdapterInstance, data: Partial<F1SessionInfo>): Promise<void> {
		if (!data) return;
		if (data.Name) {
			await adapter.setStateAsync("live_session.type", { val: data.Name, ack: true });
		}
	}

	private handleDriverList(data: Partial<F1DriverList>): void {
		if (!data) return;
		for (const [num, entry] of Object.entries(data)) {
			if (entry && typeof entry === "object") {
				this.driverList[num] = { ...this.driverList[num], ...entry };
			}
		}
	}

	private async handleTimingData(
		adapter: utils.AdapterInstance,
		data: Partial<F1TimingData>,
		timestamp: string,
	): Promise<void> {
		if (!data?.Lines) return;

		// Deep-merge diffs into in-memory state
		for (const [num, line] of Object.entries(data.Lines)) {
			if (line && typeof line === "object") {
				this.timingState[num] = deepMerge(this.timingState[num] ?? {}, line as Record<string, unknown>);
			}
		}

		// Build positions array from merged state
		const positions = Object.entries(this.timingState)
			.filter(([, line]) => (line as { Position?: string }).Position)
			.map(([num, line]) => {
				const l = line as {
					Position?: string;
					GapToLeader?: string;
					IntervalToPositionAhead?: { Value?: string };
					LastLapTime?: { Value?: string };
					BestLapTime?: { Value?: string };
					NumberOfLaps?: number;
				};
				const driver = this.driverList[num];
				return {
					driver_number: num,
					full_name: driver?.FullName ?? driver?.BroadcastName ?? num,
					name_acronym: driver?.Tla ?? "",
					team_name: driver?.TeamName ?? "",
					team_colour: driver?.TeamColour ? `#${driver.TeamColour}` : "#FFFFFF",
					position: parseInt(l.Position ?? "99"),
					gap_to_leader: l.GapToLeader ?? "",
					interval: l.IntervalToPositionAhead?.Value ?? "",
					last_lap: l.LastLapTime?.Value ?? "",
					best_lap: l.BestLapTime?.Value ?? "",
					laps: l.NumberOfLaps ?? 0,
				};
			})
			.sort((a, b) => a.position - b.position);

		if (positions.length > 0) {
			await adapter.setStateAsync("positions.current", { val: JSON.stringify(positions, null, 2), ack: true });
			await adapter.setStateAsync("positions.last_update", { val: timestamp, ack: true });

			const intervals = positions.map(p => ({
				driver_number: p.driver_number,
				gap_to_leader: p.gap_to_leader,
				interval: p.interval,
			}));
			await adapter.setStateAsync("positions.intervals", { val: JSON.stringify(intervals, null, 2), ack: true });

			await this.detectOvertakes(positions, timestamp, adapter);
		}

		// Lap times
		const lapEntries = Object.entries(this.timingState)
			.filter(([, line]) => (line as { LastLapTime?: { Value?: string } }).LastLapTime?.Value)
			.map(([num, line]) => {
				const l = line as {
					LastLapTime?: { Value?: string; PersonalFastest?: boolean };
					BestLapTime?: { Value?: string };
					NumberOfLaps?: number;
				};
				return {
					driver_number: num,
					last_lap: l.LastLapTime?.Value ?? "",
					best_lap: l.BestLapTime?.Value ?? "",
					personal_fastest: l.LastLapTime?.PersonalFastest ?? false,
					laps: l.NumberOfLaps ?? 0,
				};
			});

		if (lapEntries.length > 0) {
			await adapter.setStateAsync("laps.current", { val: JSON.stringify(lapEntries, null, 2), ack: true });
			await adapter.setStateAsync("laps.last_update", { val: timestamp, ack: true });

			const fastest = [...lapEntries]
				.filter(l => l.best_lap)
				.sort((a, b) => a.best_lap.localeCompare(b.best_lap))
				.slice(0, 10);
			if (fastest.length > 0) {
				await adapter.setStateAsync("laps.fastest", { val: JSON.stringify(fastest, null, 2), ack: true });
			}
		}
	}

	private async detectOvertakes(
		positions: Array<{ driver_number: string; position: number }>,
		timestamp: string,
		adapter: utils.AdapterInstance,
	): Promise<void> {
		for (const entry of positions) {
			const prev = this.prevPositions[entry.driver_number];
			if (prev !== undefined && prev !== entry.position && prev > entry.position) {
				const overtaken = positions.find(p => p.position === prev && p.driver_number !== entry.driver_number);
				if (overtaken) {
					this.overtakes.push({
						utc: timestamp,
						overtaking: entry.driver_number,
						overtaken: overtaken.driver_number,
						position: entry.position,
					});
				}
			}
			this.prevPositions[entry.driver_number] = entry.position;
		}

		if (this.overtakes.length > 0) {
			await adapter.setStateAsync("overtakes.all", { val: JSON.stringify(this.overtakes, null, 2), ack: true });
			await adapter.setStateAsync("overtakes.last_update", { val: timestamp, ack: true });
		}
	}

	private async handleTimingAppData(adapter: utils.AdapterInstance, data: Partial<F1TimingAppData>): Promise<void> {
		if (!data?.Lines) return;

		for (const [num, line] of Object.entries(data.Lines)) {
			if (line && typeof line === "object") {
				this.timingAppState[num] = deepMerge(this.timingAppState[num] ?? {}, line as Record<string, unknown>);
			}
		}

		const allStints: Array<{
			driver_number: string;
			stint_number: number;
			compound: string;
			total_laps: number;
			new_tyre: boolean;
		}> = [];
		const currentTyres: Array<{
			driver_number: string;
			compound: string;
			total_laps: number;
			new_tyre: boolean;
		}> = [];

		for (const [num, line] of Object.entries(this.timingAppState)) {
			const stints = (line as { Stints?: Record<string, unknown> }).Stints;
			if (!stints) continue;

			const stintEntries = Object.entries(stints);
			let maxIndex = -1;

			for (const [idx, stint] of stintEntries) {
				const s = stint as { Compound?: string; TotalLaps?: number; New?: string };
				const stintNum = parseInt(idx);
				if (s.Compound) {
					allStints.push({
						driver_number: num,
						stint_number: stintNum,
						compound: s.Compound,
						total_laps: s.TotalLaps ?? 0,
						new_tyre: s.New === "true",
					});
					if (stintNum > maxIndex) maxIndex = stintNum;
				}
			}

			if (maxIndex >= 0 && stints[maxIndex]) {
				const latest = stints[maxIndex] as { Compound?: string; TotalLaps?: number; New?: string };
				if (latest.Compound) {
					currentTyres.push({
						driver_number: num,
						compound: latest.Compound,
						total_laps: latest.TotalLaps ?? 0,
						new_tyre: latest.New === "true",
					});
				}
			}
		}

		if (allStints.length > 0) {
			await adapter.setStateAsync("tyres.stints", { val: JSON.stringify(allStints, null, 2), ack: true });
			await adapter.setStateAsync("tyres.current", { val: JSON.stringify(currentTyres, null, 2), ack: true });
			await adapter.setStateAsync("tyres.last_update", { val: new Date().toISOString(), ack: true });
		}
	}

	private async handlePitStops(adapter: utils.AdapterInstance, data: Partial<F1PitStopSeries>): Promise<void> {
		if (!data?.Lines) return;

		for (const [num, stops] of Object.entries(data.Lines)) {
			if (stops && typeof stops === "object") {
				this.pitState[num] = deepMerge(this.pitState[num] ?? {}, stops as Record<string, unknown>);
			}
		}

		const allPits: Array<{
			driver_number: string;
			stop_number: number;
			lap: number;
			duration: string;
		}> = [];

		for (const [num, stops] of Object.entries(this.pitState)) {
			for (const [idx, stop] of Object.entries(stops)) {
				const s = stop as { Duration?: string; Lap?: number };
				allPits.push({
					driver_number: num,
					stop_number: parseInt(idx),
					lap: s.Lap ?? 0,
					duration: s.Duration ?? "",
				});
			}
		}

		allPits.sort((a, b) => b.lap - a.lap || b.stop_number - a.stop_number);

		if (allPits.length > 0) {
			await adapter.setStateAsync("pit_stops.all", { val: JSON.stringify(allPits, null, 2), ack: true });
			await adapter.setStateAsync("pit_stops.latest", {
				val: JSON.stringify(allPits.slice(0, 5), null, 2),
				ack: true,
			});
			await adapter.setStateAsync("pit_stops.last_update", { val: new Date().toISOString(), ack: true });
		}
	}

	private async handleTeamRadio(adapter: utils.AdapterInstance, data: Partial<F1TeamRadio>): Promise<void> {
		if (!data?.Captures?.length) return;

		for (const capture of data.Captures) {
			this.radioCaptures.push({
				utc: capture.Utc,
				driver_number: capture.RacingNumber,
				url: STATIC_BASE + capture.Path,
			});
		}

		const sorted = [...this.radioCaptures].sort((a, b) => b.utc.localeCompare(a.utc));
		await adapter.setStateAsync("radio.all", { val: JSON.stringify(sorted, null, 2), ack: true });
		await adapter.setStateAsync("radio.latest", { val: JSON.stringify(sorted.slice(0, 10), null, 2), ack: true });
		await adapter.setStateAsync("radio.last_update", { val: new Date().toISOString(), ack: true });
	}

	private async handleRaceControl(
		adapter: utils.AdapterInstance,
		data: Partial<F1RaceControlMessages>,
	): Promise<void> {
		if (!data?.Messages) return;

		this.rcMessages = deepMerge(this.rcMessages, data.Messages as Record<string, unknown>);

		const msgs = Object.values(this.rcMessages)
			.map(m => {
				const msg = m as { Utc?: string; Lap?: number; Category?: string; Flag?: string; Message?: string };
				return {
					date: msg.Utc ?? "",
					lap_number: msg.Lap ?? 0,
					message: msg.Message ?? "",
					category: msg.Category ?? "",
					flag: msg.Flag ?? "",
				};
			})
			.sort((a, b) => b.date.localeCompare(a.date));

		await adapter.setStateAsync("race_control.messages", { val: JSON.stringify(msgs, null, 2), ack: true });

		if (msgs.length > 0) {
			const latest = msgs[0];
			const text = latest.flag ? `${latest.message} [${latest.flag}]` : latest.message;
			await adapter.setStateAsync("race_control.latest_message", { val: text, ack: true });
		}
	}

	private async handleChampionship(
		adapter: utils.AdapterInstance,
		data: Partial<F1ChampionshipPrediction>,
	): Promise<void> {
		// Update standings during session only if Jolpica data isn't available yet
		if (!data?.Drivers) return;

		const drivers = Object.entries(data.Drivers)
			.map(([num, d]) => ({ driver_number: num, position: d.CurrentPosition, points: d.Points }))
			.sort((a, b) => a.position - b.position);

		if (drivers.length > 0) {
			const current = await adapter.getStateAsync("standings.drivers");
			if (!current?.val || current.val === "[]" || current.val === "") {
				await adapter.setStateAsync("standings.drivers", { val: JSON.stringify(drivers, null, 2), ack: true });
			}
		}
	}
}
