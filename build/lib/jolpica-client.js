"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JolpikaClient = void 0;
const axios_1 = __importDefault(require("axios"));
const BASE_URL = "https://api.jolpi.ca/ergast/f1";
// Static team colour map by Ergast constructorId
const TEAM_COLORS = {
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
class JolpikaClient {
    api = axios_1.default.create({
        baseURL: BASE_URL,
        timeout: 15000,
        headers: { "User-Agent": "ioBroker.f1" },
    });
    async fetchSchedule() {
        const res = await this.api.get("/current.json");
        return res.data.MRData.RaceTable.Races;
    }
    async fetchDriverStandings() {
        const res = await this.api.get("/current/driverstandings.json?limit=100");
        const lists = res.data.MRData.StandingsTable.StandingsLists;
        if (!lists.length)
            return [];
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
    async fetchLastRaceResults() {
        const res = await this.api.get("/current/last/results.json?limit=100");
        const races = res.data.MRData.RaceTable.Races;
        return races[0]?.Results ?? [];
    }
    async fetchLastQualifyingResults() {
        const res = await this.api.get("/current/last/qualifying.json?limit=100");
        const races = res.data.MRData.RaceTable.Races;
        return races[0]?.QualifyingResults ?? [];
    }
    async fetchConstructorStandings() {
        const res = await this.api.get("/current/constructorstandings.json?limit=100");
        const lists = res.data.MRData.StandingsTable.StandingsLists;
        if (!lists.length)
            return [];
        return lists[0].ConstructorStandings.map(entry => ({
            position: parseInt(entry.position),
            team_name: entry.Constructor.name,
            points: parseFloat(entry.points),
            wins: parseInt(entry.wins),
        }));
    }
}
exports.JolpikaClient = JolpikaClient;
//# sourceMappingURL=jolpica-client.js.map