import axios from "axios";
import type {
	JolpikaRace,
	JolpikaDriverStanding,
	JolpikaConstructorStanding,
	JolpikaRaceResult,
	JolpikaQualifyingResult,
} from "./types.js";

const BASE_URL = "https://api.jolpi.ca/ergast/f1";

// Static team colour map by Ergast constructorId
const TEAM_COLORS: Record<string, string> = {
	mercedes: "#00D2BE",
	red_bull: "#3671C6",
	ferrari: "#E8002D",
	mclaren: "#FF8000",
	aston_martin: "#229971",
	alpine: "#0093CC",
	williams: "#64C4FF",
	alphatauri: "#6692FF",
	rb: "#6692FF",
	haas: "#B6BABD",
	kick_sauber: "#52E252",
	sauber: "#52E252",
	// 2026 new entries
	audi: "#FF0000",
	cadillac: "#003594",
};

export interface DriverStandingEntry {
	position: number;
	driver_number: number;
	full_name: string;
	name_acronym: string;
	team_name: string;
	team_colour: string;
	headshot_url: string;
	points: number;
	wins: number;
}

export interface TeamStandingEntry {
	position: number;
	team_name: string;
	points: number;
	wins: number;
}

export class JolpikaClient {
	private readonly api = axios.create({
		baseURL: BASE_URL,
		timeout: 15000,
		headers: { "User-Agent": "ioBroker.f1" },
	});

	async fetchSchedule(): Promise<JolpikaRace[]> {
		const res = await this.api.get<{
			MRData: { RaceTable: { Races: JolpikaRace[] } };
		}>("/current.json");
		return res.data.MRData.RaceTable.Races;
	}

	async fetchDriverStandings(): Promise<DriverStandingEntry[]> {
		const res = await this.api.get<{
			MRData: {
				StandingsTable: {
					StandingsLists: Array<{ DriverStandings: JolpikaDriverStanding[] }>;
				};
			};
		}>("/current/driverstandings.json?limit=100");

		const lists = res.data.MRData.StandingsTable.StandingsLists;
		if (!lists.length) return [];

		return lists[0].DriverStandings.map(entry => ({
			position: parseInt(entry.position),
			driver_number: parseInt(entry.Driver.permanentNumber) || 0,
			full_name: `${entry.Driver.givenName} ${entry.Driver.familyName}`,
			name_acronym: entry.Driver.code,
			team_name: entry.Constructors[0]?.name ?? "",
			team_colour: TEAM_COLORS[entry.Constructors[0]?.constructorId ?? ""] ?? "#FFFFFF",
			headshot_url: "",
			points: parseFloat(entry.points),
			wins: parseInt(entry.wins),
		}));
	}

	async fetchLastRaceResults(): Promise<JolpikaRaceResult[]> {
		const res = await this.api.get<{
			MRData: { RaceTable: { Races: Array<{ Results: JolpikaRaceResult[] }> } };
		}>("/current/last/results.json?limit=100");
		const races = res.data.MRData.RaceTable.Races;
		return races[0]?.Results ?? [];
	}

	async fetchLastQualifyingResults(): Promise<JolpikaQualifyingResult[]> {
		const res = await this.api.get<{
			MRData: { RaceTable: { Races: Array<{ QualifyingResults: JolpikaQualifyingResult[] }> } };
		}>("/current/last/qualifying.json?limit=100");
		const races = res.data.MRData.RaceTable.Races;
		return races[0]?.QualifyingResults ?? [];
	}

	async fetchConstructorStandings(): Promise<TeamStandingEntry[]> {
		const res = await this.api.get<{
			MRData: {
				StandingsTable: {
					StandingsLists: Array<{ ConstructorStandings: JolpikaConstructorStanding[] }>;
				};
			};
		}>("/current/constructorstandings.json?limit=100");

		const lists = res.data.MRData.StandingsTable.StandingsLists;
		if (!lists.length) return [];

		return lists[0].ConstructorStandings.map(entry => ({
			position: parseInt(entry.position),
			team_name: entry.Constructor.name,
			points: parseFloat(entry.points),
			wins: parseInt(entry.wins),
		}));
	}
}
