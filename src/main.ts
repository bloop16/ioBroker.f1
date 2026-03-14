import * as utils from "@iobroker/adapter-core";
import { JolpikaClient } from "./lib/jolpica-client.js";
import { SessionTracker } from "./lib/session-tracker.js";
import { SignalRClient } from "./lib/signalr-client.js";
import { StateMapper } from "./lib/state-mapper.js";
import type { JolpikaRace } from "./lib/types.js";

const SESSION_CHECK_MS = 60_000; // 1 minute
const SESSION_END_GRACE_MS = 5 * 60_000; // 5 minutes after session ends before disconnecting

class F1 extends utils.Adapter {
	private readonly jolpika = new JolpikaClient();
	private readonly tracker = new SessionTracker();
	private readonly mapper = new StateMapper();
	private readonly signalR: SignalRClient;

	private scheduleTimer?: NodeJS.Timeout;
	private sessionCheckTimer?: NodeJS.Timeout;
	private disconnectGraceTimer?: NodeJS.Timeout;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({ ...options, name: "f1" });
		this.signalR = new SignalRClient(this.log);

		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	private async onReady(): Promise<void> {
		this.log.info("Starting F1 adapter (SignalR + Jolpica)...");
		await this.initializeStates();
		await this.setStateAsync("info.connection", { val: false, ack: true });
		await this.setStateAsync("live_session.status", { val: "no_session", ack: true });

		// Wire up SignalR events
		this.signalR.on("connected", () => {
			this.setStateAsync("info.connection", { val: true, ack: true }).catch(() => {});
			this.mapper.reset();
			this.log.info("SignalR connected — live data active");
		});

		this.signalR.on("disconnected", () => {
			this.setStateAsync("info.connection", { val: false, ack: true }).catch(() => {});
		});

		this.signalR.on("message", (topic: string, data: unknown, timestamp: string) => {
			this.mapper.handle(this, topic, data, timestamp).catch((err: Error) => {
				this.log.debug(`Mapper error: ${err.message}`);
			});
		});

		// Initial data fetch
		await this.refreshScheduleAndStandings();

		// Recurring schedule refresh (every hour)
		this.scheduleTimer = setInterval(
			() => {
				this.refreshScheduleAndStandings().catch((err: Error) => {
					this.log.warn(`Schedule refresh error: ${err.message}`);
				});
			},
			(this.config.updateIntervalNormal || 3600) * 1000,
		);

		// Session check every minute → connect/disconnect SignalR
		this.sessionCheckTimer = setInterval(() => {
			this.checkAndManageSignalR().catch((err: Error) => {
				this.log.debug(`Session check error: ${err.message}`);
			});
		}, SESSION_CHECK_MS);
	}

	// ----------------------------------------------------------------
	// Jolpica: schedule + standings
	// ----------------------------------------------------------------

	private async refreshScheduleAndStandings(): Promise<void> {
		this.log.debug("Refreshing schedule and standings from Jolpica...");
		let anySuccess = false;

		try {
			const races = await this.jolpika.fetchSchedule();
			this.tracker.update(races);
			await this.updateScheduleStates(races);
			this.log.debug(`Schedule loaded: ${races.length} races`);
			anySuccess = true;
		} catch (err) {
			this.log.warn(`Failed to fetch schedule: ${(err as Error).message}`);
		}

		try {
			const [drivers, teams] = await Promise.all([
				this.jolpika.fetchDriverStandings(),
				this.jolpika.fetchConstructorStandings(),
			]);
			await this.setStateAsync("standings.drivers", { val: JSON.stringify(drivers, null, 2), ack: true });
			await this.setStateAsync("standings.teams", { val: JSON.stringify(teams, null, 2), ack: true });
			await this.setStateAsync("standings.last_update", { val: new Date().toISOString(), ack: true });
			this.log.debug("Standings updated");
			anySuccess = true;
		} catch (err) {
			this.log.warn(`Failed to fetch standings: ${(err as Error).message}`);
		}

		// Only fetch last results when no session is currently active
		if (!this.signalR.isConnected()) {
			try {
				const [raceResults, qualResults] = await Promise.all([
					this.jolpika.fetchLastRaceResults(),
					this.jolpika.fetchLastQualifyingResults(),
				]);

				if (raceResults.length > 0) {
					const mapped = raceResults.map(r => ({
						position: parseInt(r.position),
						driver_number: parseInt(r.number),
						full_name: `${r.Driver.givenName} ${r.Driver.familyName}`,
						name_acronym: r.Driver.code,
						team_name: r.Constructor.name,
						laps: parseInt(r.laps),
						status: r.status,
						time: r.Time?.time ?? "",
						points: parseFloat(r.points),
					}));
					await this.setStateAsync("session_result.current", {
						val: JSON.stringify(mapped, null, 2),
						ack: true,
					});
					await this.setStateAsync("session_result.last_update", {
						val: new Date().toISOString(),
						ack: true,
					});
				}

				if (qualResults.length > 0) {
					const mapped = qualResults.map(r => ({
						position: parseInt(r.position),
						driver_number: parseInt(r.number),
						full_name: `${r.Driver.givenName} ${r.Driver.familyName}`,
						name_acronym: r.Driver.code,
						team_name: r.Constructor.name,
						q1: r.Q1 ?? "",
						q2: r.Q2 ?? "",
						q3: r.Q3 ?? "",
					}));
					await this.setStateAsync("starting_grid.current", {
						val: JSON.stringify(mapped, null, 2),
						ack: true,
					});
					await this.setStateAsync("starting_grid.last_update", {
						val: new Date().toISOString(),
						ack: true,
					});
				}

				anySuccess = true;
			} catch (err) {
				this.log.debug(`Failed to fetch last results: ${(err as Error).message}`);
			}
		}

		// Option A: connection state reflects Jolpica availability, not just SignalR
		if (anySuccess && !this.signalR.isConnected()) {
			await this.setStateAsync("info.connection", { val: true, ack: true });
		}
	}

	private async updateScheduleStates(races: JolpikaRace[]): Promise<void> {
		// Next race
		const nextRace = this.tracker.getNextRace();
		if (nextRace) {
			const daysUntil = Math.ceil((nextRace.dateStart.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
			await this.setStateAsync("next_race.circuit", { val: nextRace.circuitName, ack: true });
			await this.setStateAsync("next_race.country", { val: nextRace.country, ack: true });
			await this.setStateAsync("next_race.location", { val: nextRace.location, ack: true });
			await this.setStateAsync("next_race.date_start", { val: nextRace.dateStart.toISOString(), ack: true });
			await this.setStateAsync("next_race.countdown_days", { val: daysUntil, ack: true });
			await this.setStateAsync("next_race.json", {
				val: JSON.stringify(
					{
						session_name: nextRace.sessionName,
						circuit_short_name: nextRace.circuitName,
						country_name: nextRace.country,
						location: nextRace.location,
						date_start: nextRace.dateStart.toISOString(),
						round: nextRace.round,
						year: parseInt(nextRace.season),
					},
					null,
					2,
				),
				ack: true,
			});
		}

		// Next session (any type)
		const nextSession = this.tracker.getNextSession();
		if (nextSession) {
			const daysUntil = Math.floor((nextSession.dateStart.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
			await this.setStateAsync("next_session.session_name", { val: nextSession.sessionName, ack: true });
			await this.setStateAsync("next_session.session_type", { val: nextSession.sessionType, ack: true });
			await this.setStateAsync("next_session.circuit", { val: nextSession.circuitName, ack: true });
			await this.setStateAsync("next_session.country", { val: nextSession.country, ack: true });
			await this.setStateAsync("next_session.location", { val: nextSession.location, ack: true });
			await this.setStateAsync("next_session.date_start", {
				val: nextSession.dateStart.toISOString(),
				ack: true,
			});
			await this.setStateAsync("next_session.countdown_days", { val: daysUntil, ack: true });
			await this.setStateAsync("next_session.json", {
				val: JSON.stringify({
					session_name: nextSession.sessionName,
					session_type: nextSession.sessionType,
					circuit_short_name: nextSession.circuitName,
					country_name: nextSession.country,
					location: nextSession.location,
					date_start: nextSession.dateStart.toISOString(),
				}),
				ack: true,
			});
		} else {
			await this.setStateAsync("next_session.session_name", { val: "No upcoming session", ack: true });
		}

		// Weekend sessions
		const weekend = this.tracker.getWeekendSessions();
		if (weekend) {
			await this.setStateAsync("weekend_sessions.circuit", { val: weekend.circuit, ack: true });
			await this.setStateAsync("weekend_sessions.country", { val: weekend.country, ack: true });
			await this.setStateAsync("weekend_sessions.location", { val: weekend.location, ack: true });
			await this.setStateAsync("weekend_sessions.sessions_count", { val: weekend.sessions.length, ack: true });
			await this.setStateAsync("weekend_sessions.next_session_index", {
				val: weekend.next_session_index,
				ack: true,
			});
			await this.setStateAsync("weekend_sessions.sessions_json", {
				val: JSON.stringify(
					weekend.sessions.map(s => ({
						session_name: s.sessionName,
						session_type: s.sessionType,
						date_start: s.dateStart.toISOString(),
						date_end: s.dateEnd.toISOString(),
					})),
				),
				ack: true,
			});
		} else {
			await this.setStateAsync("weekend_sessions.sessions_count", { val: 0, ack: true });
		}

		// Meetings
		const meetings = this.tracker.getMeetings(races);
		const now = new Date();
		const sorted = [...meetings].sort(
			(a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime(),
		);
		const current =
			sorted.find(m => new Date(m.date_start) <= now && new Date(m.date_end) >= now) ??
			sorted.filter(m => new Date(m.date_end) < now).pop() ??
			sorted[0];

		if (current) {
			await this.setStateAsync("meetings.current", { val: JSON.stringify(current, null, 2), ack: true });
		}
		await this.setStateAsync("meetings.all", { val: JSON.stringify(sorted, null, 2), ack: true });
		await this.setStateAsync("meetings.last_update", { val: new Date().toISOString(), ack: true });
	}

	// ----------------------------------------------------------------
	// SignalR lifecycle management
	// ----------------------------------------------------------------

	private async checkAndManageSignalR(): Promise<void> {
		const shouldConnect = this.tracker.shouldConnectSignalR();
		const sessionActive = this.tracker.isSessionActive();

		if (shouldConnect && !this.signalR.isConnected()) {
			// Cancel any pending disconnect
			if (this.disconnectGraceTimer) {
				clearTimeout(this.disconnectGraceTimer);
				this.disconnectGraceTimer = undefined;
			}
			await this.signalR.connect();
		} else if (!shouldConnect && this.signalR.isConnected()) {
			// After session ends, wait grace period before disconnecting
			if (!this.disconnectGraceTimer) {
				this.log.info(`Session ended — disconnecting SignalR in ${SESSION_END_GRACE_MS / 60_000} minutes`);
				this.disconnectGraceTimer = setTimeout(() => {
					this.disconnectGraceTimer = undefined;
					if (!this.tracker.shouldConnectSignalR()) {
						this.signalR.disconnect();
						this.setStateAsync("live_session.status", { val: "no_session", ack: true }).catch(() => {});
						this.log.info("SignalR disconnected (session over)");
					}
				}, SESSION_END_GRACE_MS);
			}
		}

		if (!sessionActive && !this.signalR.isConnected()) {
			await this.setStateAsync("live_session.status", { val: "no_session", ack: true });
		}
	}

	// ----------------------------------------------------------------
	// State initialization
	// ----------------------------------------------------------------

	private async initializeStates(): Promise<void> {
		// Next Race
		await this.setObjectNotExistsAsync("next_race", {
			type: "channel",
			common: { name: "Next Race Information" },
			native: {},
		});
		for (const s of [
			{ id: "circuit", name: "Circuit Name", type: "string", role: "text" },
			{ id: "country", name: "Country", type: "string", role: "text" },
			{ id: "location", name: "Location", type: "string", role: "text" },
			{ id: "date_start", name: "Race Start", type: "string", role: "date" },
			{ id: "countdown_days", name: "Days until race", type: "number", role: "value", unit: "days" },
			{ id: "json", name: "Next Race (JSON)", type: "string", role: "json" },
		]) {
			await this.setObjectNotExistsAsync(`next_race.${s.id}`, {
				type: "state",
				common: {
					name: s.name,
					type: s.type as "string" | "number",
					role: s.role,
					read: true,
					write: false,
					...(s.unit && { unit: s.unit }),
				},
				native: {},
			});
		}

		// Next Session
		await this.setObjectNotExistsAsync("next_session", {
			type: "channel",
			common: { name: "Next Session" },
			native: {},
		});
		for (const s of [
			{ id: "session_name", name: "Session Name", type: "string", role: "text" },
			{ id: "session_type", name: "Session Type", type: "string", role: "text" },
			{ id: "circuit", name: "Circuit", type: "string", role: "text" },
			{ id: "country", name: "Country", type: "string", role: "text" },
			{ id: "location", name: "Location", type: "string", role: "text" },
			{ id: "date_start", name: "Session Start", type: "string", role: "date" },
			{ id: "countdown_days", name: "Days until session", type: "number", role: "value", unit: "days" },
			{ id: "json", name: "Next Session (JSON)", type: "string", role: "json" },
		]) {
			await this.setObjectNotExistsAsync(`next_session.${s.id}`, {
				type: "state",
				common: {
					name: s.name,
					type: s.type as "string" | "number",
					role: s.role,
					read: true,
					write: false,
					...(s.unit && { unit: s.unit }),
				},
				native: {},
			});
		}

		// Weekend Sessions
		await this.setObjectNotExistsAsync("weekend_sessions", {
			type: "channel",
			common: { name: "Weekend Sessions" },
			native: {},
		});
		for (const s of [
			{ id: "circuit", name: "Circuit", type: "string", role: "text" },
			{ id: "country", name: "Country", type: "string", role: "text" },
			{ id: "location", name: "Location", type: "string", role: "text" },
			{ id: "sessions_count", name: "Session Count", type: "number", role: "value" },
			{ id: "next_session_index", name: "Next Session Index", type: "number", role: "value" },
			{ id: "sessions_json", name: "Sessions (JSON)", type: "string", role: "json" },
		]) {
			await this.setObjectNotExistsAsync(`weekend_sessions.${s.id}`, {
				type: "state",
				common: { name: s.name, type: s.type as "string" | "number", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Standings
		await this.setObjectNotExistsAsync("standings", {
			type: "channel",
			common: { name: "Championship Standings" },
			native: {},
		});
		for (const s of [
			{ id: "drivers", name: "Driver Standings", role: "json" },
			{ id: "teams", name: "Team Standings", role: "json" },
			{ id: "last_update", name: "Last Update", role: "date" },
		]) {
			await this.setObjectNotExistsAsync(`standings.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Live Session
		await this.setObjectNotExistsAsync("live_session", {
			type: "channel",
			common: { name: "Live Session Data" },
			native: {},
		});
		for (const s of [
			{ id: "status", name: "Session Status", type: "string", role: "text" },
			{ id: "type", name: "Session Type", type: "string", role: "text" },
			{ id: "track_status", name: "Track Status", type: "string", role: "text" },
			{ id: "laps_total", name: "Total Laps", type: "number", role: "value" },
			{ id: "weather", name: "Weather Data", type: "string", role: "json" },
		]) {
			await this.setObjectNotExistsAsync(`live_session.${s.id}`, {
				type: "state",
				common: { name: s.name, type: s.type as "string" | "number", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Race Control
		await this.setObjectNotExistsAsync("race_control", {
			type: "channel",
			common: { name: "Race Control Messages" },
			native: {},
		});
		for (const s of [
			{ id: "latest_message", name: "Latest Message", role: "text" },
			{ id: "messages", name: "All Messages", role: "json" },
		]) {
			await this.setObjectNotExistsAsync(`race_control.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Positions
		await this.setObjectNotExistsAsync("positions", {
			type: "channel",
			common: { name: "Driver Positions" },
			native: {},
		});
		for (const s of [
			{ id: "current", name: "Current Positions", role: "json" },
			{ id: "intervals", name: "Intervals", role: "json" },
			{ id: "last_update", name: "Last Update", role: "date" },
		]) {
			await this.setObjectNotExistsAsync(`positions.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Laps
		await this.setObjectNotExistsAsync("laps", {
			type: "channel",
			common: { name: "Lap Timing Data" },
			native: {},
		});
		for (const s of [
			{ id: "current", name: "Current Lap Times", role: "json" },
			{ id: "fastest", name: "Fastest Laps", role: "json" },
			{ id: "last_update", name: "Last Update", role: "date" },
		]) {
			await this.setObjectNotExistsAsync(`laps.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Pit Stops
		await this.setObjectNotExistsAsync("pit_stops", {
			type: "channel",
			common: { name: "Pit Stop Data" },
			native: {},
		});
		for (const s of [
			{ id: "latest", name: "Latest Pit Stops", role: "json" },
			{ id: "all", name: "All Pit Stops", role: "json" },
			{ id: "last_update", name: "Last Update", role: "date" },
		]) {
			await this.setObjectNotExistsAsync(`pit_stops.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Tyres
		await this.setObjectNotExistsAsync("tyres", {
			type: "channel",
			common: { name: "Tyre Strategy Data" },
			native: {},
		});
		for (const s of [
			{ id: "stints", name: "Tyre Stints", role: "json" },
			{ id: "current", name: "Current Tyres", role: "json" },
			{ id: "last_update", name: "Last Update", role: "date" },
		]) {
			await this.setObjectNotExistsAsync(`tyres.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Radio
		await this.setObjectNotExistsAsync("radio", {
			type: "channel",
			common: { name: "Team Radio Messages" },
			native: {},
		});
		for (const s of [
			{ id: "latest", name: "Latest Radio Messages", role: "json" },
			{ id: "all", name: "All Radio Messages", role: "json" },
			{ id: "last_update", name: "Last Update", role: "date" },
		]) {
			await this.setObjectNotExistsAsync(`radio.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Car Data
		await this.setObjectNotExistsAsync("car_data", {
			type: "channel",
			common: { name: "Car Telemetry Data" },
			native: {},
		});
		for (const s of [
			{ id: "latest", name: "Latest Telemetry", role: "json" },
			{ id: "last_update", name: "Last Update", role: "date" },
		]) {
			await this.setObjectNotExistsAsync(`car_data.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Location
		await this.setObjectNotExistsAsync("location", {
			type: "channel",
			common: { name: "Car Location Data" },
			native: {},
		});
		for (const s of [
			{ id: "current", name: "Current Positions", role: "json" },
			{ id: "last_update", name: "Last Update", role: "date" },
		]) {
			await this.setObjectNotExistsAsync(`location.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Meetings
		await this.setObjectNotExistsAsync("meetings", {
			type: "channel",
			common: { name: "Race Meetings" },
			native: {},
		});
		for (const s of [
			{ id: "current", name: "Current Meeting", role: "json" },
			{ id: "all", name: "All Meetings (Year)", role: "json" },
			{ id: "last_update", name: "Last Update", role: "date" },
		]) {
			await this.setObjectNotExistsAsync(`meetings.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Overtakes
		await this.setObjectNotExistsAsync("overtakes", { type: "channel", common: { name: "Overtakes" }, native: {} });
		for (const s of [
			{ id: "all", name: "All Overtakes", role: "json" },
			{ id: "last_update", name: "Last Update", role: "date" },
		]) {
			await this.setObjectNotExistsAsync(`overtakes.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Session Result
		await this.setObjectNotExistsAsync("session_result", {
			type: "channel",
			common: { name: "Session Results" },
			native: {},
		});
		for (const s of [
			{ id: "current", name: "Session Result", role: "json" },
			{ id: "last_update", name: "Last Update", role: "date" },
		]) {
			await this.setObjectNotExistsAsync(`session_result.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}

		// Starting Grid
		await this.setObjectNotExistsAsync("starting_grid", {
			type: "channel",
			common: { name: "Starting Grid" },
			native: {},
		});
		for (const s of [
			{ id: "current", name: "Starting Grid", role: "json" },
			{ id: "last_update", name: "Last Update", role: "date" },
		]) {
			await this.setObjectNotExistsAsync(`starting_grid.${s.id}`, {
				type: "state",
				common: { name: s.name, type: "string", role: s.role, read: true, write: false },
				native: {},
			});
		}
	}

	// ----------------------------------------------------------------

	private onUnload(callback: () => void): void {
		try {
			if (this.scheduleTimer) {
				clearInterval(this.scheduleTimer);
			}
			if (this.sessionCheckTimer) {
				clearInterval(this.sessionCheckTimer);
			}
			if (this.disconnectGraceTimer) {
				clearTimeout(this.disconnectGraceTimer);
			}
			this.signalR.destroy();
			this.log.info("F1 adapter stopped");
		} finally {
			callback();
		}
	}

	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (state) {
			this.log.debug(`State changed: ${id}`);
		}
	}
}

if (require.main !== module) {
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new F1(options);
} else {
	(() => new F1())();
}
