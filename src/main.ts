import * as utils from "@iobroker/adapter-core";
import axios from "axios";

interface NextRace {
	session_key: number;
	session_name: string;
	session_type: string;
	date_start: string;
	date_end: string;
	circuit_short_name: string;
	country_name: string;
	location: string;
	year: number;
}

interface Driver {
	driver_number: number;
	full_name: string;
	name_acronym: string;
	team_name: string;
	team_colour: string;
	headshot_url: string;
}

interface Session {
	session_key: number;
	session_name: string;
	session_type: string;
	date_start: string;
	date_end: string;
}

interface WeekendSessions {
	circuit: string;
	country: string;
	location: string;
	year: number;
	sessions: NextRace[];
	next_session_index: number;
}

interface Weather {
	air_temperature: number;
	humidity: number;
	pressure: number;
	rainfall: number;
	track_temperature: number;
	wind_direction: number;
	wind_speed: number;
}

interface RaceControlMessage {
	date: string;
	lap_number: number;
	message: string;
	category: string;
	flag: string;
}

interface Position {
	driver_number: number;
	position: number;
	date: string;
}

interface Lap {
	driver_number: number;
	lap_number: number;
	lap_duration: number;
	is_pit_out_lap: boolean;
	sector_1_duration: number;
	sector_2_duration: number;
	sector_3_duration: number;
	i1_speed: number;
	i2_speed: number;
	st_speed: number;
}

interface Interval {
	driver_number: number;
	gap_to_leader: number;
	interval: number;
}

interface PitStop {
	driver_number: number;
	lap_number: number;
	pit_duration: number;
	date: string;
}

interface Stint {
	driver_number: number;
	stint_number: number;
	lap_start: number;
	lap_end: number;
	compound: string;
	tyre_age_at_start: number;
}

interface Radio {
	driver_number: number;
	date: string;
	recording_url: string;
}

interface CarData {
	driver_number: number;
	date: string;
	speed: number;
	throttle: number;
	brake: number;
	gear: number;
	rpm: number;
	drs: number;
}

interface Location {
	driver_number: number;
	date: string;
	x: number;
	y: number;
	z: number;
}

class F1 extends utils.Adapter {
	private readonly ERGAST_DRIVER_STANDINGS_URL =
		"https://api.jolpi.ca/ergast/f1/current/driverstandings.json?limit=100";
	private readonly ERGAST_CONSTRUCTOR_STANDINGS_URL =
		"https://api.jolpi.ca/ergast/f1/current/constructorstandings.json?limit=100";
	private updateInterval?: NodeJS.Timeout;
	private api: ReturnType<typeof axios.create>;
	private currentPollingMode: "race" | "normal" = "normal";
	private currentSessionKey?: number;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "f1",
		});

		this.api = axios.create({
			baseURL: "https://api.openf1.org/v1",
			timeout: 10000,
			headers: { "User-Agent": "ioBroker.f1" },
		});

		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	private async onReady(): Promise<void> {
		this.log.info("Starting F1 adapter...");
		await this.initializeStates();
		await this.setStateAsync("info.connection", { val: false, ack: true });
		await this.updatePollingInterval();
		await this.fetchData();
	}

	private async updatePollingInterval(): Promise<void> {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
		}

		let interval: number;

		if (this.config.enableDynamicPolling) {
			const hasActiveSession = await this.checkActiveSession();

			if (hasActiveSession) {
				interval = (this.config.updateIntervalRace || 10) * 1000;
				if (this.currentPollingMode !== "race") {
					this.currentPollingMode = "race";
					this.log.info("Switching to RACE mode");
				}
			} else {
				interval = (this.config.updateIntervalNormal || 3600) * 1000;
				if (this.currentPollingMode !== "normal") {
					this.currentPollingMode = "normal";
					this.log.info("Switching to NORMAL mode");
				}
			}
		} else {
			interval = (this.config.updateIntervalNormal || 3600) * 1000;
		}

		this.updateInterval = setInterval(() => this.fetchData(), interval);
		this.log.debug("Next update scheduled");
	}

	private async checkActiveSession(): Promise<boolean> {
		try {
			const now = new Date();
			const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

			const response = await this.api.get<Session[]>("/sessions", {
				params: {
					date_start_gte: todayStart.toISOString(),
					date_start_lte: todayEnd.toISOString(),
				},
			});

			if (!response.data || response.data.length === 0) {
				return false;
			}

			for (const session of response.data) {
				const sessionStart = new Date(session.date_start);
				const sessionEnd = new Date(session.date_end);

				if (now >= sessionStart && now <= sessionEnd) {
					this.log.debug("Active session detected");
					this.currentSessionKey = session.session_key;
					return true;
				}
			}

			for (const session of response.data) {
				const sessionStart = new Date(session.date_start);
				const minutesUntilStart = (sessionStart.getTime() - now.getTime()) / (1000 * 60);

				if (minutesUntilStart > 0 && minutesUntilStart <= 30) {
					this.log.debug("Session starting soon");
					this.currentSessionKey = session.session_key;
					return true;
				}
			}

			this.currentSessionKey = undefined;
			return false;
		} catch {
			this.log.debug("Failed to check active session");
			return false;
		}
	}

	private async initializeStates(): Promise<void> {
		// Next Race
		await this.setObjectNotExistsAsync("next_race", {
			type: "channel",
			common: { name: "Next Race Information" },
			native: {},
		});

		const raceStates = [
			{ id: "circuit", name: "Circuit Name", type: "string", role: "text" },
			{ id: "country", name: "Country", type: "string", role: "text" },
			{ id: "location", name: "Location", type: "string", role: "text" },
			{ id: "date_start", name: "Race Start", type: "string", role: "date" },
			{ id: "countdown_days", name: "Days until race", type: "number", role: "value", unit: "days" },
			{ id: "json", name: "Next Race (JSON)", type: "string", role: "json" },
		];

		for (const state of raceStates) {
			await this.setObjectNotExistsAsync(`next_race.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: state.type as "string" | "number",
					role: state.role,
					read: true,
					write: false,
					...(state.unit && { unit: state.unit }),
				},
				native: {},
			});
		}

		// Next Session
		await this.setObjectNotExistsAsync("next_session", {
			type: "channel",
			common: { name: "Next Session Information" },
			native: {},
		});

		const nextSessionStates = [
			{ id: "session_name", name: "Session Name", type: "string", role: "text" },
			{ id: "session_type", name: "Session Type", type: "string", role: "text" },
			{ id: "circuit", name: "Circuit Name", type: "string", role: "text" },
			{ id: "country", name: "Country", type: "string", role: "text" },
			{ id: "location", name: "Location", type: "string", role: "text" },
			{ id: "date_start", name: "Session Start", type: "string", role: "date" },
			{ id: "countdown_days", name: "Days until session", type: "number", role: "value", unit: "days" },
			{ id: "json", name: "Next Session (JSON)", type: "string", role: "json" },
		];

		for (const state of nextSessionStates) {
			await this.setObjectNotExistsAsync(`next_session.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: state.type as "string" | "number",
					role: state.role,
					read: true,
					write: false,
					...(state.unit && { unit: state.unit }),
				},
				native: {},
			});
		}

		// Weekend Sessions
		await this.setObjectNotExistsAsync("weekend_sessions", {
			type: "channel",
			common: { name: "Next Race Weekend Sessions" },
			native: {},
		});

		const weekendSessionStates = [
			{ id: "circuit", name: "Circuit Name", type: "string", role: "text" },
			{ id: "country", name: "Country", type: "string", role: "text" },
			{ id: "location", name: "Location", type: "string", role: "text" },
			{ id: "sessions_count", name: "Number of Sessions", type: "number", role: "value" },
			{ id: "next_session_index", name: "Next Session Index", type: "number", role: "value" },
			{ id: "sessions_json", name: "Weekend Sessions (JSON)", type: "string", role: "json" },
		];

		for (const state of weekendSessionStates) {
			await this.setObjectNotExistsAsync(`weekend_sessions.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: state.type as "string" | "number",
					role: state.role,
					read: true,
					write: false,
				},
				native: {},
			});
		}

		// Standings
		await this.setObjectNotExistsAsync("standings", {
			type: "channel",
			common: { name: "Championship Standings" },
			native: {},
		});

		const standingsStates = [
			{ id: "drivers", name: "Driver Standings", type: "string", role: "json" },
			{ id: "teams", name: "Team Standings", type: "string", role: "json" },
			{ id: "last_update", name: "Last Update", type: "string", role: "date" },
		];

		for (const state of standingsStates) {
			await this.setObjectNotExistsAsync(`standings.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: state.type as "string",
					role: state.role,
					read: true,
					write: false,
				},
				native: {},
			});
		}

		// Live Session
		await this.setObjectNotExistsAsync("live_session", {
			type: "channel",
			common: { name: "Live Session Data" },
			native: {},
		});

		const liveStates = [
			{ id: "status", name: "Session Status", type: "string", role: "text" },
			{ id: "type", name: "Session Type", type: "string", role: "text" },
			{ id: "track_status", name: "Track Status", type: "string", role: "text" },
			{ id: "laps_total", name: "Total Laps", type: "number", role: "value" },
			{ id: "weather", name: "Weather Data", type: "string", role: "json" },
		];

		for (const state of liveStates) {
			await this.setObjectNotExistsAsync(`live_session.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: state.type as "string" | "number",
					role: state.role,
					read: true,
					write: false,
				},
				native: {},
			});
		}

		// Race Control
		await this.setObjectNotExistsAsync("race_control", {
			type: "channel",
			common: { name: "Race Control Messages" },
			native: {},
		});

		const raceControlStates = [
			{ id: "latest_message", name: "Latest Message", type: "string", role: "text" },
			{ id: "messages", name: "All Messages", type: "string", role: "json" },
		];

		for (const state of raceControlStates) {
			await this.setObjectNotExistsAsync(`race_control.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: "string",
					role: state.role,
					read: true,
					write: false,
				},
				native: {},
			});
		}

		// Positions
		await this.setObjectNotExistsAsync("positions", {
			type: "channel",
			common: { name: "Driver Positions" },
			native: {},
		});

		const positionStates = [
			{ id: "current", name: "Current Positions", type: "string", role: "json" },
			{ id: "intervals", name: "Intervals", type: "string", role: "json" },
			{ id: "last_update", name: "Last Update", type: "string", role: "date" },
		];

		for (const state of positionStates) {
			await this.setObjectNotExistsAsync(`positions.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: "string",
					role: state.role,
					read: true,
					write: false,
				},
				native: {},
			});
		}

		// Laps
		await this.setObjectNotExistsAsync("laps", {
			type: "channel",
			common: { name: "Lap Timing Data" },
			native: {},
		});

		const lapStates = [
			{ id: "current", name: "Current Lap Times", type: "string", role: "json" },
			{ id: "fastest", name: "Fastest Laps", type: "string", role: "json" },
			{ id: "last_update", name: "Last Update", type: "string", role: "date" },
		];

		for (const state of lapStates) {
			await this.setObjectNotExistsAsync(`laps.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: "string",
					role: state.role,
					read: true,
					write: false,
				},
				native: {},
			});
		}

		// Pit Stops
		await this.setObjectNotExistsAsync("pit_stops", {
			type: "channel",
			common: { name: "Pit Stop Data" },
			native: {},
		});

		const pitStates = [
			{ id: "latest", name: "Latest Pit Stops", type: "string", role: "json" },
			{ id: "all", name: "All Pit Stops", type: "string", role: "json" },
			{ id: "last_update", name: "Last Update", type: "string", role: "date" },
		];

		for (const state of pitStates) {
			await this.setObjectNotExistsAsync(`pit_stops.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: "string",
					role: state.role,
					read: true,
					write: false,
				},
				native: {},
			});
		}

		// Tyres (NEW)
		await this.setObjectNotExistsAsync("tyres", {
			type: "channel",
			common: { name: "Tyre Strategy Data" },
			native: {},
		});

		const tyreStates = [
			{ id: "stints", name: "Tyre Stints", type: "string", role: "json" },
			{ id: "current", name: "Current Tyres", type: "string", role: "json" },
			{ id: "last_update", name: "Last Update", type: "string", role: "date" },
		];

		for (const state of tyreStates) {
			await this.setObjectNotExistsAsync(`tyres.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: "string",
					role: state.role,
					read: true,
					write: false,
				},
				native: {},
			});
		}

		// Team Radio (NEW)
		await this.setObjectNotExistsAsync("radio", {
			type: "channel",
			common: { name: "Team Radio Messages" },
			native: {},
		});

		const radioStates = [
			{ id: "latest", name: "Latest Radio Messages", type: "string", role: "json" },
			{ id: "all", name: "All Radio Messages", type: "string", role: "json" },
			{ id: "last_update", name: "Last Update", type: "string", role: "date" },
		];

		for (const state of radioStates) {
			await this.setObjectNotExistsAsync(`radio.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: "string",
					role: state.role,
					read: true,
					write: false,
				},
				native: {},
			});
		}

		// Car Data (NEW)
		await this.setObjectNotExistsAsync("car_data", {
			type: "channel",
			common: { name: "Car Telemetry Data" },
			native: {},
		});

		const carDataStates = [
			{ id: "latest", name: "Latest Telemetry", type: "string", role: "json" },
			{ id: "last_update", name: "Last Update", type: "string", role: "date" },
		];

		for (const state of carDataStates) {
			await this.setObjectNotExistsAsync(`car_data.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: "string",
					role: state.role,
					read: true,
					write: false,
				},
				native: {},
			});
		}

		// Location (NEW)
		await this.setObjectNotExistsAsync("location", {
			type: "channel",
			common: { name: "Car Location Data" },
			native: {},
		});

		const locationStates = [
			{ id: "current", name: "Current Positions", type: "string", role: "json" },
			{ id: "last_update", name: "Last Update", type: "string", role: "date" },
		];

		for (const state of locationStates) {
			await this.setObjectNotExistsAsync(`location.${state.id}`, {
				type: "state",
				common: {
					name: state.name,
					type: "string",
					role: state.role,
					read: true,
					write: false,
				},
				native: {},
			});
		}
	}

	private async fetchData(): Promise<void> {
		try {
			this.log.debug("Fetching data from OpenF1 API...");

			const nextRace = await this.getNextRace();
			if (nextRace) {
				await this.updateNextRaceStates(nextRace);

				// Fetch next session (any type) and weekend sessions
				const nextSession = await this.getNextSession();
				if (nextSession) {
					await this.updateNextSession(nextSession);
				}

				const weekendSessions: WeekendSessions | null = await this.getWeekendSessions();
				if (weekendSessions) {
					await this.updateWeekendSessions(weekendSessions);
				}
			}

			await this.updateStandings();

			if (this.currentSessionKey) {
				await this.updateLiveSession();
				await this.updateRaceControl();
				await this.updatePositions();
				await this.updateLaps();
				await this.updatePitStops();
				await this.updateTyres();
				await this.updateRadio();
				await this.updateCarData();
				await this.updateLocation();
			} else {
				await this.setStateAsync("live_session.status", { val: "no_session", ack: true });
			}

			await this.setStateAsync("info.connection", { val: true, ack: true });

			if (this.config.enableDynamicPolling) {
				await this.updatePollingInterval();
			}
		} catch {
			this.log.error("Failed to fetch data");
			await this.setStateAsync("info.connection", { val: false, ack: true });
		}
	}

	private async getNextRace(): Promise<NextRace | null> {
		try {
			const now = new Date();
			const year = now.getFullYear();

			const response = await this.api.get<NextRace[]>("/sessions", {
				params: { session_name: "Race", year: year },
			});

			if (response.data && response.data.length > 0) {
				const futureRaces = response.data.filter((race: NextRace) => new Date(race.date_start) > now);

				if (futureRaces.length > 0) {
					return futureRaces.sort(
						(a: NextRace, b: NextRace) =>
							new Date(a.date_start).getTime() - new Date(b.date_start).getTime(),
					)[0];
				}
			}
			return null;
		} catch {
			this.log.error("Failed to get next race");
			return null;
		}
	}

	private async updateNextRaceStates(race: NextRace): Promise<void> {
		await this.setStateAsync("next_race.circuit", { val: race.circuit_short_name, ack: true });
		await this.setStateAsync("next_race.country", { val: race.country_name, ack: true });
		await this.setStateAsync("next_race.location", { val: race.location, ack: true });
		await this.setStateAsync("next_race.date_start", { val: race.date_start, ack: true });
		const daysUntil = Math.ceil((new Date(race.date_start).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
		await this.setStateAsync("next_race.countdown_days", { val: daysUntil, ack: true });
		await this.setStateAsync("next_race.json", { val: JSON.stringify(race, null, 2), ack: true });
		this.log.debug("Next race updated");
	}

	private async updateStandings(): Promise<void> {
		try {
			// Fetch driver standings from Ergast API
			const driverResponse: any = await axios.get(this.ERGAST_DRIVER_STANDINGS_URL);
			const driverStandings =
				driverResponse.data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];

			// Fetch constructor standings from Ergast API
			const constructorResponse: any = await axios.get(this.ERGAST_CONSTRUCTOR_STANDINGS_URL);
			const constructorStandings =
				constructorResponse.data?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || [];

			if (driverStandings.length > 0) {
				// Fetch driver details from OpenF1 for headshot URLs
				const openF1Response = await this.api.get<Driver[]>("/drivers", {
					params: { session_key: "latest" },
				});
				const openF1Drivers = openF1Response.data || [];

				// Create lookup map by driver number
				const headshotMap = new Map<number, string>();
				openF1Drivers.forEach((driver: Driver) => {
					if (driver.headshot_url) {
						headshotMap.set(driver.driver_number, driver.headshot_url);
					}
				});

				// Transform Ergast data to our format
				const drivers = driverStandings.map((standing: any) => {
					const driverNumber = parseInt(standing.Driver.permanentNumber);
					return {
						position: parseInt(standing.position),
						driver_number: driverNumber,
						full_name: `${standing.Driver.givenName} ${standing.Driver.familyName}`,
						name_acronym: standing.Driver.code,
						team_name: standing.Constructors[0]?.name || "Unknown",
						team_colour: this.getTeamColour(standing.Constructors[0]?.constructorId),
						headshot_url: headshotMap.get(driverNumber) || "",
						points: parseInt(standing.points),
						wins: parseInt(standing.wins),
					};
				});

				await this.setStateAsync("standings.drivers", {
					val: JSON.stringify(drivers, null, 2),
					ack: true,
				});
			}

			if (constructorStandings.length > 0) {
				// Transform constructor data
				const teams = constructorStandings.map((standing: any) => ({
					position: parseInt(standing.position),
					team_name: standing.Constructor.name,
					points: parseInt(standing.points),
					wins: parseInt(standing.wins),
				}));

				await this.setStateAsync("standings.teams", {
					val: JSON.stringify(teams, null, 2),
					ack: true,
				});
			}

			await this.setStateAsync("standings.last_update", {
				val: new Date().toISOString(),
				ack: true,
			});

			this.log.debug("Updated standings from Ergast API + OpenF1 headshots");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error(`Failed to update standings: ${message}`);
		}
	}
	private getTeamColour(constructorId: string): string {
		const colours: Record<string, string> = {
			mercedes: "00D2BE",
			ferrari: "E8002D",
			red_bull: "3671C6",
			mclaren: "FF8000",
			alpine: "0093CC",
			aston_martin: "229971",
			haas: "B6BABD",
			alphatauri: "6692FF",
			rb: "6692FF",
			williams: "64C4FF",
			sauber: "FF0000",
			audi: "FF0000",
			kick_sauber: "FF0000",
		};
		return colours[constructorId] || "FFFFFF";
	}
	private async updateLiveSession(): Promise<void> {
		if (!this.currentSessionKey) {
			return;
		}

		try {
			const sessionResponse = await this.api.get<Session[]>("/sessions", {
				params: { session_key: this.currentSessionKey },
			});

			if (sessionResponse.data && sessionResponse.data.length > 0) {
				const session = sessionResponse.data[0];
				const now = new Date();
				const sessionStart = new Date(session.date_start);
				const sessionEnd = new Date(session.date_end);

				let status = "unknown";
				if (now < sessionStart) {
					status = "pre_session";
				} else if (now >= sessionStart && now <= sessionEnd) {
					status = "active";
				} else {
					status = "finished";
				}

				await this.setStateAsync("live_session.status", { val: status, ack: true });
				await this.setStateAsync("live_session.type", { val: session.session_name, ack: true });
			}

			const weatherResponse = await this.api.get<Weather[]>("/weather", {
				params: {
					session_key: this.currentSessionKey,
				},
			});

			if (weatherResponse.data && weatherResponse.data.length > 0) {
				const latestWeather = weatherResponse.data[weatherResponse.data.length - 1];
				await this.setStateAsync("live_session.weather", {
					val: JSON.stringify(latestWeather, null, 2),
					ack: true,
				});
			}

			this.log.debug("Updated live session");
		} catch {
			this.log.debug("Failed to update live session");
		}
	}

	private async updateRaceControl(): Promise<void> {
		if (!this.currentSessionKey) {
			return;
		}

		try {
			const response = await this.api.get<RaceControlMessage[]>("/race_control", {
				params: {
					session_key: this.currentSessionKey,
				},
			});

			if (response.data && response.data.length > 0) {
				const messages = response.data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

				const latestMessage = messages[0];
				const msgText = `${latestMessage.message} (${latestMessage.flag || latestMessage.category})`;
				await this.setStateAsync("race_control.latest_message", {
					val: msgText,
					ack: true,
				});
				await this.setStateAsync("race_control.messages", {
					val: JSON.stringify(messages, null, 2),
					ack: true,
				});

				this.log.debug("Updated race control");
			}
		} catch {
			this.log.debug("Failed to update race control");
		}
	}

	private async updatePositions(): Promise<void> {
		if (!this.currentSessionKey) {
			return;
		}

		try {
			const posResponse = await this.api.get<Position[]>("/position", {
				params: {
					session_key: this.currentSessionKey,
				},
			});

			if (posResponse.data && posResponse.data.length > 0) {
				const latestPositions = posResponse.data
					.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
					.slice(0, 20)
					.sort((a, b) => a.position - b.position);

				await this.setStateAsync("positions.current", {
					val: JSON.stringify(latestPositions, null, 2),
					ack: true,
				});
				await this.setStateAsync("positions.last_update", {
					val: new Date().toISOString(),
					ack: true,
				});
			}

			const intResponse = await this.api.get<Interval[]>("/intervals", {
				params: {
					session_key: this.currentSessionKey,
				},
			});

			if (intResponse.data && intResponse.data.length > 0) {
				await this.setStateAsync("positions.intervals", {
					val: JSON.stringify(intResponse.data, null, 2),
					ack: true,
				});
			}

			this.log.debug("Updated positions");
		} catch {
			this.log.debug("Failed to update positions");
		}
	}

	private async updateLaps(): Promise<void> {
		if (!this.currentSessionKey) {
			return;
		}

		try {
			const response = await this.api.get<Lap[]>("/laps", {
				params: {
					session_key: this.currentSessionKey,
				},
			});

			if (response.data && response.data.length > 0) {
				const currentLaps = response.data
					.filter(lap => lap.lap_duration > 0)
					.sort((a, b) => b.lap_number - a.lap_number)
					.slice(0, 20);

				const fastestLaps = response.data
					.filter(lap => lap.lap_duration > 0 && !lap.is_pit_out_lap)
					.sort((a, b) => a.lap_duration - b.lap_duration)
					.slice(0, 10);

				await this.setStateAsync("laps.current", {
					val: JSON.stringify(currentLaps, null, 2),
					ack: true,
				});
				await this.setStateAsync("laps.fastest", {
					val: JSON.stringify(fastestLaps, null, 2),
					ack: true,
				});
				await this.setStateAsync("laps.last_update", {
					val: new Date().toISOString(),
					ack: true,
				});

				this.log.debug("Updated lap times");
			}
		} catch {
			this.log.debug("Failed to update lap times");
		}
	}

	private async updatePitStops(): Promise<void> {
		if (!this.currentSessionKey) {
			return;
		}

		try {
			const response = await this.api.get<PitStop[]>("/pit", {
				params: {
					session_key: this.currentSessionKey,
				},
			});

			if (response.data && response.data.length > 0) {
				const allPits = response.data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

				const latestPits = allPits.slice(0, 5);

				await this.setStateAsync("pit_stops.latest", {
					val: JSON.stringify(latestPits, null, 2),
					ack: true,
				});
				await this.setStateAsync("pit_stops.all", {
					val: JSON.stringify(allPits, null, 2),
					ack: true,
				});
				await this.setStateAsync("pit_stops.last_update", {
					val: new Date().toISOString(),
					ack: true,
				});

				this.log.debug("Updated pit stops");
			}
		} catch {
			this.log.debug("Failed to update pit stops");
		}
	}

	private async updateTyres(): Promise<void> {
		if (!this.currentSessionKey) {
			return;
		}

		try {
			const response = await this.api.get<Stint[]>("/stints", {
				params: {
					session_key: this.currentSessionKey,
				},
			});

			if (response.data && response.data.length > 0) {
				const allStints = response.data.sort((a, b) => {
					if (a.driver_number === b.driver_number) {
						return b.stint_number - a.stint_number;
					}
					return a.driver_number - b.driver_number;
				});

				const currentTyres: any[] = [];
				const seenDrivers = new Set<number>();

				for (const stint of allStints) {
					if (!seenDrivers.has(stint.driver_number)) {
						currentTyres.push(stint);
						seenDrivers.add(stint.driver_number);
					}
				}

				await this.setStateAsync("tyres.stints", {
					val: JSON.stringify(allStints, null, 2),
					ack: true,
				});
				await this.setStateAsync("tyres.current", {
					val: JSON.stringify(currentTyres, null, 2),
					ack: true,
				});
				await this.setStateAsync("tyres.last_update", {
					val: new Date().toISOString(),
					ack: true,
				});

				this.log.debug("Updated tyre data");
			}
		} catch {
			this.log.debug("Failed to update tyre data");
		}
	}

	private async updateRadio(): Promise<void> {
		if (!this.currentSessionKey) {
			return;
		}

		try {
			const response = await this.api.get<Radio[]>("/team_radio", {
				params: {
					session_key: this.currentSessionKey,
				},
			});

			if (response.data && response.data.length > 0) {
				const allRadio = response.data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

				const latestRadio = allRadio.slice(0, 10);

				await this.setStateAsync("radio.latest", {
					val: JSON.stringify(latestRadio, null, 2),
					ack: true,
				});
				await this.setStateAsync("radio.all", {
					val: JSON.stringify(allRadio, null, 2),
					ack: true,
				});
				await this.setStateAsync("radio.last_update", {
					val: new Date().toISOString(),
					ack: true,
				});

				this.log.debug("Updated team radio");
			}
		} catch {
			this.log.debug("Failed to update team radio");
		}
	}

	private async updateCarData(): Promise<void> {
		if (!this.currentSessionKey) {
			return;
		}

		try {
			const response = await this.api.get<CarData[]>("/car_data", {
				params: {
					session_key: this.currentSessionKey,
				},
			});

			if (response.data && response.data.length > 0) {
				const latestData = response.data
					.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
					.slice(0, 20);

				await this.setStateAsync("car_data.latest", {
					val: JSON.stringify(latestData, null, 2),
					ack: true,
				});
				await this.setStateAsync("car_data.last_update", {
					val: new Date().toISOString(),
					ack: true,
				});

				this.log.debug("Updated car telemetry");
			}
		} catch {
			this.log.debug("Failed to update car telemetry");
		}
	}

	private async updateLocation(): Promise<void> {
		if (!this.currentSessionKey) {
			return;
		}

		try {
			const response = await this.api.get<Location[]>("/location", {
				params: {
					session_key: this.currentSessionKey,
				},
			});

			if (response.data && response.data.length > 0) {
				const latestLocations = response.data
					.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
					.slice(0, 20);

				await this.setStateAsync("location.current", {
					val: JSON.stringify(latestLocations, null, 2),
					ack: true,
				});
				await this.setStateAsync("location.last_update", {
					val: new Date().toISOString(),
					ack: true,
				});

				this.log.debug("Updated car locations");
			}
		} catch {
			this.log.debug("Failed to update car locations");
		}
	}

	/**
	 * Get next session (any type: Practice, Qualifying, Sprint, Race)
	 */
	private async getNextSession(): Promise<NextRace | null> {
		try {
			const now = new Date();
			const year = now.getFullYear();

			const response = await this.api.get<NextRace[]>("/sessions", {
				params: { year: year },
			});

			if (response.data && response.data.length > 0) {
				const futureSessions = response.data.filter((session: NextRace) => new Date(session.date_start) > now);

				if (futureSessions.length > 0) {
					return futureSessions.sort(
						(a: NextRace, b: NextRace) =>
							new Date(a.date_start).getTime() - new Date(b.date_start).getTime(),
					)[0];
				}
			}
			return null;
		} catch {
			this.log.error("Failed to fetch next session");
			return null;
		}
	}

	/**
	 * Get all sessions for the next race weekend
	 */
	private async getWeekendSessions(): Promise<WeekendSessions | null> {
		try {
			const now = new Date();
			const year = now.getFullYear();

			// Get all sessions for the year
			const response = await this.api.get<NextRace[]>("/sessions", {
				params: { year: year },
			});

			if (!response.data || response.data.length === 0) {
				return null;
			}

			// Filter future sessions
			const futureSessions = response.data.filter((session: NextRace) => new Date(session.date_start) > now);

			if (futureSessions.length === 0) {
				return null;
			}

			// Sort by date
			futureSessions.sort(
				(a: NextRace, b: NextRace) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime(),
			);

			// Group by circuit (sessions within 7 days = same weekend)
			const firstSession = futureSessions[0];
			const firstSessionDate = new Date(firstSession.date_start);
			const weekendEnd = new Date(firstSessionDate);
			weekendEnd.setDate(weekendEnd.getDate() + 7);

			const weekendSessionsList = futureSessions.filter((session: NextRace) => {
				const sessionDate = new Date(session.date_start);
				return (
					session.circuit_short_name === firstSession.circuit_short_name &&
					sessionDate >= firstSessionDate &&
					sessionDate <= weekendEnd
				);
			});

			// Find next session index
			const nextSessionIndex = 0; // First session is always next

			return {
				circuit: firstSession.circuit_short_name,
				country: firstSession.country_name,
				location: firstSession.location,
				year: firstSession.year,
				sessions: weekendSessionsList,
				next_session_index: nextSessionIndex,
			};
		} catch {
			this.log.error("Failed to fetch weekend sessions");
			return null;
		}
	}

	/**
	 * Update next_session states
	 *
	 * @param session - Next session data
	 */
	private async updateNextSession(session: NextRace | null): Promise<void> {
		if (session) {
			await this.setStateAsync("next_session.session_name", {
				val: session.session_name,
				ack: true,
			});
			await this.setStateAsync("next_session.session_type", {
				val: session.session_type,
				ack: true,
			});
			await this.setStateAsync("next_session.circuit", { val: session.circuit_short_name, ack: true });
			await this.setStateAsync("next_session.country", { val: session.country_name, ack: true });
			await this.setStateAsync("next_session.location", { val: session.location, ack: true });
			await this.setStateAsync("next_session.date_start", { val: session.date_start, ack: true });

			const daysUntil = Math.floor((new Date(session.date_start).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
			await this.setStateAsync("next_session.countdown_days", { val: daysUntil, ack: true });

			await this.setStateAsync("next_session.json", { val: JSON.stringify(session), ack: true });
		} else {
			await this.setStateAsync("next_session.session_name", { val: "No upcoming session", ack: true });
		}
	}

	/**
	 * Update weekend_sessions states
	 *
	 * @param weekend - Weekend sessions data
	 */
	private async updateWeekendSessions(weekend: WeekendSessions | null): Promise<void> {
		if (weekend) {
			await this.setStateAsync("weekend_sessions.circuit", { val: weekend.circuit, ack: true });
			await this.setStateAsync("weekend_sessions.country", { val: weekend.country, ack: true });
			await this.setStateAsync("weekend_sessions.location", { val: weekend.location, ack: true });
			await this.setStateAsync("weekend_sessions.sessions_count", {
				val: weekend.sessions.length,
				ack: true,
			});
			await this.setStateAsync("weekend_sessions.next_session_index", {
				val: weekend.next_session_index,
				ack: true,
			});
			await this.setStateAsync("weekend_sessions.sessions_json", {
				val: JSON.stringify(weekend.sessions),
				ack: true,
			});
		} else {
			await this.setStateAsync("weekend_sessions.sessions_count", { val: 0, ack: true });
		}
	}
	private onUnload(callback: () => void): void {
		try {
			if (this.updateInterval) {
				clearInterval(this.updateInterval);
			}
			this.log.info("F1 adapter stopped");
			callback();
		} catch {
			callback();
		}
	}

	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (state) {
			this.log.debug("state changed");
		} else {
			this.log.debug("state deleted");
		}
	}
}

if (require.main !== module) {
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new F1(options);
} else {
	(() => new F1())();
}
