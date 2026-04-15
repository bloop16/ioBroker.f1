"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils = __importStar(require("@iobroker/adapter-core"));
const axios_1 = __importDefault(require("axios"));
const ws_1 = __importDefault(require("ws"));
// ── Constants ─────────────────────────────────────────────────────────────────
const SUBSCRIBE_STREAMS = [
    "TrackStatus",
    "SessionStatus",
    "SessionInfo",
    "WeatherData",
    "LapCount",
    "ExtrapolatedClock",
    "TimingData",
    "DriverList",
    "TimingAppData",
    "RaceControlMessages",
    "TopThree",
    "TeamRadio",
    "PitStopSeries",
    "TyreStintSeries",
];
const SESSION_DURATIONS = {
    "Practice 1": 60,
    "Practice 2": 60,
    "Practice 3": 60,
    Qualifying: 60,
    "Sprint Qualifying": 45,
    Sprint: 45,
    Race: 120,
};
const TRACK_STATUS_MAP = {
    1: "AllClear",
    2: "Yellow",
    3: "Flag",
    4: "SafetyCar",
    5: "RedFlag",
    6: "VSCDeployed",
    7: "VSCEnding",
    8: "SafetyCarEnding",
};
// ── Adapter class ─────────────────────────────────────────────────────────────
class F1 extends utils.Adapter {
    JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";
    ERGAST_BASE = "https://ergast.com/api/f1";
    SIGNALR_BASE = "https://livetiming.formula1.com/signalr";
    // HTTP clients
    ergastApi;
    ltApi;
    // Timers
    scheduleInterval;
    liveCheckInterval;
    reconnectTimeout;
    // Live state
    currentLiveSession = null;
    lastSavedSession = "";
    ws = null;
    wsConnecting = false;
    // In-memory SignalR stream caches (merged incrementally)
    driverList = {};
    timingData = {};
    timingAppData = {};
    rcMessages = [];
    constructor(options = {}) {
        super({ ...options, name: "f1" });
        this.ergastApi = axios_1.default.create({
            timeout: 15000,
            headers: { "User-Agent": "ioBroker.f1/1.0" },
        });
        this.ltApi = axios_1.default.create({
            baseURL: "https://livetiming.formula1.com",
            timeout: 8000,
            headers: { "User-Agent": "ioBroker.f1/1.0" },
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    async onReady() {
        this.log.info("Starting F1 adapter...");
        await this.initializeStates();
        await this.setStateAsync("info.connection", { val: false, ack: true });
        // Initial full data load
        await this.refreshJolpicaData();
        // Hourly Jolpica refresh
        this.scheduleInterval = this.setInterval(() => void this.refreshJolpicaData(), 60 * 60 * 1000);
        // Live check every 60 seconds
        await this.checkLiveStatus();
        this.liveCheckInterval = this.setInterval(() => void this.checkLiveStatus(), 60 * 1000);
        await this.setStateAsync("info.connection", { val: true, ack: true });
    }
    onStateChange(id, state) {
        if (!state || state.ack) {
            return;
        }
        this.log.debug(`State change: ${id}`);
    }
    onUnload(callback) {
        try {
            if (this.scheduleInterval) {
                this.clearInterval(this.scheduleInterval);
            }
            if (this.liveCheckInterval) {
                this.clearInterval(this.liveCheckInterval);
            }
            if (this.reconnectTimeout) {
                this.clearTimeout(this.reconnectTimeout);
            }
            this.disconnectSignalR();
            callback();
        }
        catch {
            callback();
        }
    }
    // ── State Initialization ──────────────────────────────────────────────────
    async initializeStates() {
        const channels = [
            {
                id: "schedule",
                name: "Race Schedule",
                states: [
                    { id: "next_race_name", name: "Next Race Name", type: "string", role: "text" },
                    { id: "next_race_round", name: "Next Race Round", type: "number", role: "value" },
                    { id: "next_race_circuit", name: "Next Race Circuit", type: "string", role: "text" },
                    { id: "next_race_country", name: "Next Race Country", type: "string", role: "text" },
                    { id: "next_race_date", name: "Next Race Date (UTC)", type: "string", role: "date" },
                    {
                        id: "next_race_countdown_days",
                        name: "Days until Race",
                        type: "number",
                        role: "value",
                        unit: "days",
                    },
                    { id: "next_session_name", name: "Next Session Name", type: "string", role: "text" },
                    { id: "next_session_type", name: "Next Session Type", type: "string", role: "text" },
                    { id: "next_session_date", name: "Next Session Date (UTC)", type: "string", role: "date" },
                    {
                        id: "next_session_countdown_hours",
                        name: "Hours until Session",
                        type: "number",
                        role: "value",
                        unit: "h",
                    },
                    { id: "weekend_json", name: "Current Weekend Sessions (JSON)", type: "string", role: "json" },
                    { id: "calendar", name: "Full Season Calendar (JSON)", type: "string", role: "json" },
                ],
            },
            {
                id: "standings",
                name: "Championship Standings",
                states: [
                    { id: "drivers", name: "Driver Standings (JSON)", type: "string", role: "json" },
                    { id: "teams", name: "Team Standings (JSON)", type: "string", role: "json" },
                    { id: "last_update", name: "Last Update", type: "string", role: "date" },
                ],
            },
            {
                id: "results",
                name: "Session Results",
                states: [
                    { id: "race", name: "Race Result (JSON)", type: "string", role: "json" },
                    { id: "qualifying", name: "Qualifying Result (JSON)", type: "string", role: "json" },
                    { id: "sprint", name: "Sprint Result (JSON)", type: "string", role: "json" },
                    { id: "fp1", name: "Practice 1 Result (JSON)", type: "string", role: "json" },
                    { id: "fp2", name: "Practice 2 Result (JSON)", type: "string", role: "json" },
                    { id: "fp3", name: "Practice 3 Result (JSON)", type: "string", role: "json" },
                    { id: "last_update", name: "Last Update", type: "string", role: "date" },
                ],
            },
            {
                id: "live",
                name: "Live Session Data (F1 Live Timing)",
                states: [
                    { id: "is_live", name: "Session Active", type: "boolean", role: "indicator" },
                    { id: "session_name", name: "Session Name", type: "string", role: "text" },
                    { id: "session_status", name: "Session Status", type: "string", role: "text" },
                    { id: "track_status", name: "Track Status", type: "string", role: "text" },
                    { id: "laps_current", name: "Current Lap", type: "number", role: "value" },
                    { id: "laps_total", name: "Total Laps", type: "number", role: "value" },
                    { id: "time_remaining", name: "Time Remaining", type: "string", role: "text" },
                    { id: "time_elapsed", name: "Time Elapsed", type: "string", role: "text" },
                    { id: "weather", name: "Track Weather (JSON)", type: "string", role: "json" },
                    { id: "race_control", name: "Race Control Messages (JSON)", type: "string", role: "json" },
                    { id: "top_three", name: "Top 3 Drivers (JSON)", type: "string", role: "json" },
                    { id: "drivers", name: "All Drivers with Position/Tyre (JSON)", type: "string", role: "json" },
                    { id: "tyres", name: "Current Tyres per Driver (JSON)", type: "string", role: "json" },
                    { id: "pit_stops", name: "Pit Stops (JSON)", type: "string", role: "json" },
                    { id: "team_radio", name: "Team Radio (JSON)", type: "string", role: "json" },
                    { id: "last_update", name: "Last Update", type: "string", role: "date" },
                ],
            },
        ];
        for (const channel of channels) {
            await this.setObjectNotExistsAsync(channel.id, {
                type: "channel",
                common: { name: channel.name },
                native: {},
            });
            for (const state of channel.states) {
                await this.setObjectNotExistsAsync(`${channel.id}.${state.id}`, {
                    type: "state",
                    common: {
                        name: state.name,
                        type: state.type,
                        role: state.role,
                        read: true,
                        write: false,
                        ...(state.unit && { unit: state.unit }),
                    },
                    native: {},
                });
            }
        }
    }
    // ── Jolpica / Ergast data ─────────────────────────────────────────────────
    /**
     * Fetch from Jolpica with automatic fallback to ergast.com.
     * Returns null (instead of throwing) on 404 — endpoint not found on both hosts.
     *
     * @param path - API path, e.g. "/current/last/results.json"
     */
    async fetchErgast(path) {
        // Helper to detect "not found" errors so we don't waste the fallback on them
        const isNotFound = (e) => {
            const status = e?.response?.status;
            return status === 404 || status === 410;
        };
        try {
            const res = await this.ergastApi.get(`${this.JOLPICA_BASE}${path}`);
            return res.data;
        }
        catch (jolpicaErr) {
            if (isNotFound(jolpicaErr)) {
                this.log.debug(`Jolpica 404 for: ${path} — skipping fallback`);
                return null;
            }
            // Network error / 5xx → try ergast.com
            this.log.debug(`Jolpica unavailable, falling back to ergast.com for: ${path}`);
            try {
                const res = await this.ergastApi.get(`${this.ERGAST_BASE}${path}`);
                return res.data;
            }
            catch (ergastErr) {
                if (isNotFound(ergastErr)) {
                    this.log.debug(`Ergast 404 for: ${path}`);
                    return null;
                }
                throw ergastErr;
            }
        }
    }
    async refreshJolpicaData() {
        try {
            const races = await this.fetchSchedule();
            const allSessions = races.flatMap(r => this.buildSessionsFromRace(r));
            await this.updateScheduleStates(races, allSessions, new Date());
            void this.updateStandings();
            void this.updateLatestResults();
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.log.warn(`Jolpica refresh failed: ${msg}`);
        }
    }
    async fetchSchedule() {
        try {
            const data = await this.fetchErgast("/current.json");
            return data?.MRData?.RaceTable?.Races ?? [];
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.log.warn(`Schedule fetch failed: ${msg}`);
            return [];
        }
    }
    buildSessionsFromRace(race) {
        const sessions = [];
        const round = parseInt(race.round, 10);
        const base = {
            round,
            raceName: race.raceName,
            circuit: race.Circuit.circuitName,
            country: race.Circuit.Location.country,
        };
        const add = (name, type, dt) => {
            if (!dt) {
                return;
            }
            const startUTC = new Date(`${dt.date}T${dt.time}`);
            const durationMin = SESSION_DURATIONS[name] ?? 90;
            const endUTC = new Date(startUTC.getTime() + durationMin * 60 * 1000);
            sessions.push({
                ...base,
                name,
                type,
                startUTC: startUTC.toISOString(),
                endUTC: endUTC.toISOString(),
            });
        };
        add("Practice 1", "Practice", race.FirstPractice);
        add("Practice 2", "Practice", race.SecondPractice);
        add("Practice 3", "Practice", race.ThirdPractice);
        add("Sprint Qualifying", "SprintQualifying", race.SprintQualifying);
        add("Sprint", "Sprint", race.Sprint);
        add("Qualifying", "Qualifying", race.Qualifying);
        add("Race", "Race", { date: race.date, time: race.time });
        return sessions;
    }
    async updateScheduleStates(races, allSessions, now) {
        if (races.length === 0) {
            return;
        }
        // Full season calendar
        const calendar = races.map(r => ({
            round: parseInt(r.round, 10),
            race_name: r.raceName,
            circuit: r.Circuit.circuitName,
            country: r.Circuit.Location.country,
            date: r.date,
            time: r.time,
        }));
        await this.setStateAsync("schedule.calendar", { val: JSON.stringify(calendar, null, 2), ack: true });
        // Next race (keep current race as "next" for 3h after start — same as f1_sensor)
        const GRACE_MS = 3 * 60 * 60 * 1000;
        const nextRace = races.find(r => new Date(`${r.date}T${r.time}`).getTime() + GRACE_MS > now.getTime());
        if (nextRace) {
            const raceDate = new Date(`${nextRace.date}T${nextRace.time}`);
            const daysUntil = Math.max(0, Math.ceil((raceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            await this.setStateAsync("schedule.next_race_name", { val: nextRace.raceName, ack: true });
            await this.setStateAsync("schedule.next_race_round", {
                val: parseInt(nextRace.round, 10),
                ack: true,
            });
            await this.setStateAsync("schedule.next_race_circuit", {
                val: nextRace.Circuit.circuitName,
                ack: true,
            });
            await this.setStateAsync("schedule.next_race_country", {
                val: nextRace.Circuit.Location.country,
                ack: true,
            });
            await this.setStateAsync("schedule.next_race_date", { val: raceDate.toISOString(), ack: true });
            await this.setStateAsync("schedule.next_race_countdown_days", { val: daysUntil, ack: true });
            const weekendRound = parseInt(nextRace.round, 10);
            const weekendSessions = allSessions.filter(s => s.round === weekendRound);
            await this.setStateAsync("schedule.weekend_json", {
                val: JSON.stringify(weekendSessions, null, 2),
                ack: true,
            });
        }
        // Next individual session
        const nextSession = allSessions.find(s => new Date(s.startUTC) > now);
        if (nextSession) {
            const startDate = new Date(nextSession.startUTC);
            const hoursUntil = Math.max(0, Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60)));
            await this.setStateAsync("schedule.next_session_name", { val: nextSession.name, ack: true });
            await this.setStateAsync("schedule.next_session_type", { val: nextSession.type, ack: true });
            await this.setStateAsync("schedule.next_session_date", {
                val: nextSession.startUTC,
                ack: true,
            });
            await this.setStateAsync("schedule.next_session_countdown_hours", {
                val: hoursUntil,
                ack: true,
            });
        }
    }
    // ── Live Session Detection ─────────────────────────────────────────────────
    detectLiveSession(sessions, now) {
        const PRE_MS = 30 * 60 * 1000; // 30 min pre-buffer
        const POST_MS = 10 * 60 * 1000; // 10 min post-buffer
        for (const session of sessions) {
            const start = new Date(new Date(session.startUTC).getTime() - PRE_MS);
            const end = new Date(new Date(session.endUTC).getTime() + POST_MS);
            if (now >= start && now <= end) {
                return session;
            }
        }
        return null;
    }
    async checkLiveStatus() {
        try {
            const races = await this.fetchSchedule();
            const allSessions = races.flatMap(r => this.buildSessionsFromRace(r));
            const now = new Date();
            const prevSession = this.currentLiveSession;
            this.currentLiveSession = this.detectLiveSession(allSessions, now);
            if (this.currentLiveSession) {
                await this.setStateAsync("live.is_live", { val: true, ack: true });
                await this.setStateAsync("live.session_name", {
                    val: this.currentLiveSession.name,
                    ack: true,
                });
                // Connect SignalR if not already connected
                if (!this.ws || this.ws.readyState === ws_1.default.CLOSED) {
                    void this.connectSignalR();
                }
            }
            else {
                await this.setStateAsync("live.is_live", { val: false, ack: true });
                if (this.ws) {
                    this.disconnectSignalR();
                }
                // Session just ended → refresh results & standings
                if (prevSession) {
                    const savedKey = `${prevSession.round}-${prevSession.type}`;
                    if (savedKey !== this.lastSavedSession) {
                        this.lastSavedSession = savedKey;
                        this.log.info(`Session ended: ${prevSession.name} (round ${prevSession.round}). Refreshing results...`);
                        void this.updateLatestResults();
                        if (prevSession.type === "Race") {
                            void this.updateStandings();
                        }
                    }
                }
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.log.warn(`Live check failed: ${msg}`);
        }
    }
    // ── SignalR Connection (F1 Live Timing) ───────────────────────────────────
    async connectSignalR() {
        if (this.wsConnecting) {
            return;
        }
        this.wsConnecting = true;
        try {
            // 1. Negotiate to get connection token + cookies
            const negRes = await this.ltApi.get("/signalr/negotiate", {
                params: {
                    clientProtocol: "1.5",
                    connectionData: '[{"name":"Streaming"}]',
                },
            });
            const token = encodeURIComponent(negRes.data.ConnectionToken);
            const cookies = (negRes.headers["set-cookie"] ?? []).join("; ");
            // 2. Build WebSocket URL
            const wsUrl = `wss://livetiming.formula1.com/signalr/connect` +
                `?clientProtocol=1.5&transport=webSockets` +
                `&connectionData=${encodeURIComponent('[{"name":"Streaming"}]')}` +
                `&connectionToken=${token}`;
            // 3. Connect
            this.ws = new ws_1.default(wsUrl, { headers: { Cookie: cookies } });
            this.ws.on("open", () => {
                this.log.info("F1 Live Timing: WebSocket connected");
                const subscribeMsg = JSON.stringify({
                    H: "Streaming",
                    M: "Subscribe",
                    A: [SUBSCRIBE_STREAMS],
                    I: 1,
                });
                this.ws.send(subscribeMsg);
            });
            this.ws.on("message", (raw) => {
                let str;
                if (Buffer.isBuffer(raw)) {
                    str = raw.toString("utf8");
                }
                else if (Array.isArray(raw)) {
                    str = Buffer.concat(raw).toString("utf8");
                }
                else {
                    str = Buffer.from(raw).toString("utf8");
                }
                void this.handleWsMessage(str);
            });
            this.ws.on("close", () => {
                this.log.info("F1 Live Timing: WebSocket disconnected");
                this.ws = null;
                // Reconnect after 5s if still in live window
                if (this.currentLiveSession) {
                    this.reconnectTimeout = this.setTimeout(() => void this.connectSignalR(), 5000);
                }
            });
            this.ws.on("error", (err) => {
                this.log.warn(`F1 Live Timing WebSocket error: ${err.message}`);
            });
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.log.warn(`F1 Live Timing connect failed: ${msg}`);
            if (this.currentLiveSession) {
                this.reconnectTimeout = this.setTimeout(() => void this.connectSignalR(), 15000);
            }
        }
        finally {
            this.wsConnecting = false;
        }
    }
    disconnectSignalR() {
        if (this.reconnectTimeout) {
            this.clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = undefined;
        }
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }
        // Reset in-memory caches
        this.driverList = {};
        this.timingData = {};
        this.timingAppData = {};
        this.rcMessages = [];
    }
    // ── SignalR Message Processing ─────────────────────────────────────────────
    async handleWsMessage(raw) {
        let payload;
        try {
            payload = JSON.parse(raw);
        }
        catch {
            return;
        }
        for (const msg of payload?.M ?? []) {
            if (msg.M !== "feed" || !Array.isArray(msg.A) || msg.A.length < 2) {
                continue;
            }
            const [stream, data] = msg.A;
            await this.handleStreamData(stream, data);
        }
    }
    async handleStreamData(stream, data) {
        try {
            switch (stream) {
                case "TrackStatus":
                    await this.onTrackStatus(data);
                    break;
                case "SessionStatus":
                    await this.onSessionStatus(data);
                    break;
                case "SessionInfo":
                    await this.onSessionInfo(data);
                    break;
                case "WeatherData":
                    await this.onWeatherData(data);
                    break;
                case "LapCount":
                    await this.onLapCount(data);
                    break;
                case "ExtrapolatedClock":
                    await this.onExtrapolatedClock(data);
                    break;
                case "DriverList":
                    this.driverList = this.deepMerge(this.driverList, data);
                    await this.publishDrivers();
                    break;
                case "TimingData":
                    if (data?.Lines) {
                        this.timingData = this.deepMerge(this.timingData, data.Lines);
                        await this.publishDrivers();
                    }
                    break;
                case "TimingAppData":
                    if (data?.Lines) {
                        this.timingAppData = this.deepMerge(this.timingAppData, data.Lines);
                        await this.publishDrivers();
                    }
                    break;
                case "RaceControlMessages":
                    await this.onRaceControl(data);
                    break;
                case "TopThree":
                    await this.onTopThree(data);
                    break;
                case "TeamRadio":
                    await this.onTeamRadio(data);
                    break;
                case "PitStopSeries":
                    await this.onPitStops(data);
                    break;
                case "TyreStintSeries":
                    await this.onTyreStints(data);
                    break;
            }
            await this.setStateAsync("live.last_update", { val: new Date().toISOString(), ack: true });
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.log.debug(`Stream ${stream} error: ${msg}`);
        }
    }
    async onTrackStatus(data) {
        const statusCode = String(data?.Status ?? "");
        const mapped = TRACK_STATUS_MAP[statusCode] ?? data?.Message ?? statusCode;
        await this.setStateAsync("live.track_status", { val: mapped, ack: true });
    }
    async onSessionStatus(data) {
        const status = String(data?.Status ?? data ?? "");
        await this.setStateAsync("live.session_status", { val: status, ack: true });
    }
    async onSessionInfo(data) {
        const name = String(data?.Name ?? data?.Type ?? "");
        if (name) {
            await this.setStateAsync("live.session_name", { val: name, ack: true });
        }
    }
    async onWeatherData(data) {
        const weather = {
            air_temperature: parseFloat(data?.AirTemp ?? 0),
            track_temperature: parseFloat(data?.TrackTemp ?? 0),
            humidity: parseFloat(data?.Humidity ?? 0),
            pressure: parseFloat(data?.Pressure ?? 0),
            rainfall: parseFloat(data?.Rainfall ?? 0),
            wind_speed: parseFloat(data?.WindSpeed ?? 0),
            wind_direction: parseInt(String(data?.WindDirection ?? 0), 10),
        };
        await this.setStateAsync("live.weather", { val: JSON.stringify(weather, null, 2), ack: true });
    }
    async onLapCount(data) {
        if (data?.CurrentLap != null) {
            await this.setStateAsync("live.laps_current", {
                val: parseInt(String(data.CurrentLap), 10),
                ack: true,
            });
        }
        if (data?.TotalLaps != null) {
            await this.setStateAsync("live.laps_total", {
                val: parseInt(String(data.TotalLaps), 10),
                ack: true,
            });
        }
    }
    async onExtrapolatedClock(data) {
        if (data?.Remaining != null) {
            await this.setStateAsync("live.time_remaining", {
                val: String(data.Remaining),
                ack: true,
            });
        }
        if (data?.Elapsed != null) {
            await this.setStateAsync("live.time_elapsed", { val: String(data.Elapsed), ack: true });
        }
    }
    async onRaceControl(data) {
        // Messages can come as object {"0": {...}, "1": {...}} or array
        const incoming = data?.Messages ? Object.values(data.Messages) : Array.isArray(data) ? data : [];
        if (incoming.length === 0) {
            return;
        }
        this.rcMessages.push(...incoming);
        if (this.rcMessages.length > 50) {
            this.rcMessages = this.rcMessages.slice(-50);
        }
        await this.setStateAsync("live.race_control", {
            val: JSON.stringify(this.rcMessages.slice(-20), null, 2),
            ack: true,
        });
    }
    async onTopThree(data) {
        const lines = Array.isArray(data?.Lines) ? data.Lines : [];
        if (lines.length === 0) {
            return;
        }
        const top3 = lines.slice(0, 3).map((l) => ({
            position: parseInt(String(l.Position ?? 0), 10),
            racing_number: String(l.RacingNumber ?? ""),
            full_name: String(l.FullName ?? ""),
            name_acronym: String(l.Tla ?? ""),
            team: String(l.Team ?? ""),
        }));
        await this.setStateAsync("live.top_three", { val: JSON.stringify(top3, null, 2), ack: true });
    }
    async onTeamRadio(data) {
        const captures = data?.Captures ? Object.values(data.Captures) : Array.isArray(data) ? data : [];
        if (captures.length === 0) {
            return;
        }
        await this.setStateAsync("live.team_radio", {
            val: JSON.stringify(captures.slice(-10), null, 2),
            ack: true,
        });
    }
    async onPitStops(data) {
        const stops = [];
        for (const [num, pits] of Object.entries(data ?? {})) {
            if (Array.isArray(pits)) {
                for (const p of pits) {
                    stops.push({ racing_number: num, ...p });
                }
            }
        }
        if (stops.length > 0) {
            await this.setStateAsync("live.pit_stops", {
                val: JSON.stringify(stops, null, 2),
                ack: true,
            });
        }
    }
    async onTyreStints(data) {
        const tyres = [];
        for (const [num, stints] of Object.entries(data ?? {})) {
            if (Array.isArray(stints) && stints.length > 0) {
                const current = stints[stints.length - 1];
                tyres.push({
                    racing_number: num,
                    compound: current.Compound ?? "",
                    total_laps: current.TotalLaps ?? 0,
                    is_new: current.New ?? false,
                });
            }
        }
        if (tyres.length > 0) {
            await this.setStateAsync("live.tyres", { val: JSON.stringify(tyres, null, 2), ack: true });
        }
    }
    /**
     * Merge DriverList + TimingData + TimingAppData into one `live.drivers` state.
     * This mirrors what f1_sensor does with its LiveDriversCoordinator.
     */
    async publishDrivers() {
        const drivers = [];
        for (const [num, info] of Object.entries(this.driverList)) {
            if (!info || typeof info !== "object") {
                continue;
            }
            const timing = this.timingData[num] ?? {};
            const appData = this.timingAppData[num] ?? {};
            const stints = appData?.Stints ? Object.values(appData.Stints) : [];
            const currentStint = stints.length > 0 ? stints[stints.length - 1] : null;
            const position = parseInt(String(timing?.Position ?? 0), 10) || null;
            drivers.push({
                racing_number: info.RacingNumber ?? num,
                full_name: info.FullName ?? "",
                name_acronym: info.Tla ?? "",
                team_name: info.TeamName ?? "",
                team_colour: info.TeamColour ?? "",
                position,
                gap_to_leader: timing?.GapToLeader ?? null,
                interval: timing?.IntervalToPositionAhead?.Value ?? null,
                last_lap_time: timing?.LastLapTime?.Value ?? null,
                tyre_compound: currentStint?.Compound ?? null,
                tyre_laps: currentStint?.TotalLaps ?? null,
                tyre_new: currentStint?.New ?? null,
            });
        }
        if (drivers.length === 0) {
            return;
        }
        drivers.sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
        await this.setStateAsync("live.drivers", {
            val: JSON.stringify(drivers, null, 2),
            ack: true,
        });
    }
    // ── Standings ─────────────────────────────────────────────────────────────
    async updateStandings() {
        const delays = [10000, 30000, 90000];
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const [driverRes, constructorRes] = await Promise.all([
                    this.fetchErgast("/current/driverstandings.json?limit=100"),
                    this.fetchErgast("/current/constructorstandings.json?limit=100"),
                ]);
                const driverStandings = driverRes?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
                const constructorStandings = constructorRes?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];
                if (driverStandings.length > 0) {
                    const drivers = driverStandings.map((s) => ({
                        position: parseInt(String(s.position), 10),
                        driver_number: parseInt(String(s.Driver.permanentNumber), 10),
                        full_name: `${s.Driver.givenName} ${s.Driver.familyName}`,
                        name_acronym: s.Driver.code ?? "",
                        team_name: s.Constructors?.[0]?.name ?? "",
                        team_colour: this.getTeamColour(s.Constructors?.[0]?.constructorId ?? ""),
                        points: parseFloat(String(s.points)),
                        wins: parseInt(String(s.wins), 10),
                    }));
                    await this.setStateAsync("standings.drivers", {
                        val: JSON.stringify(drivers, null, 2),
                        ack: true,
                    });
                }
                if (constructorStandings.length > 0) {
                    const teams = constructorStandings.map((s) => ({
                        position: parseInt(String(s.position), 10),
                        team_name: s.Constructor.name,
                        team_colour: this.getTeamColour(s.Constructor.constructorId),
                        points: parseFloat(String(s.points)),
                        wins: parseInt(String(s.wins), 10),
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
                this.log.debug("Standings updated");
                return;
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                if (attempt < 2) {
                    this.log.warn(`Standings fetch failed (attempt ${attempt + 1}/3): ${msg}. Retrying in ${delays[attempt] / 1000}s...`);
                    await new Promise(resolve => this.setTimeout(() => resolve(), delays[attempt]));
                }
                else {
                    this.log.error(`Failed to update standings after 3 attempts: ${msg}`);
                }
            }
        }
    }
    // ── Results ───────────────────────────────────────────────────────────────
    async updateLatestResults() {
        const wrap = async (label, fn) => {
            try {
                await fn();
            }
            catch (e) {
                this.log.warn(`Results [${label}] failed: ${e instanceof Error ? e.message : String(e)}`);
            }
        };
        let round = null;
        await wrap("race", () => this.updateRaceResults());
        await wrap("qualifying", async () => {
            round = await this.updateQualifyingResults();
        });
        await wrap("sprint", () => this.updateSprintResults());
        if (round != null) {
            await Promise.allSettled([
                wrap("fp1", () => this.updatePracticeResults(round, "fp1", 1)),
                wrap("fp2", () => this.updatePracticeResults(round, "fp2", 2)),
                wrap("fp3", () => this.updatePracticeResults(round, "fp3", 3)),
            ]);
        }
        await this.setStateAsync("results.last_update", { val: new Date().toISOString(), ack: true });
        this.log.info("Results updated");
    }
    async updateRaceResults() {
        const data = await this.fetchErgast("/current/last/results.json?limit=100");
        const race = data?.MRData?.RaceTable?.Races?.[0];
        if (!race) {
            this.log.debug("No race results from Ergast");
            return;
        }
        const results = race.Results.map(r => ({
            position: parseInt(r.positionText, 10) || 0,
            driver_number: parseInt(r.number, 10),
            name_acronym: r.Driver.code ?? "",
            full_name: `${r.Driver.givenName} ${r.Driver.familyName}`,
            team_name: r.Constructor.name,
            team_colour: this.getTeamColour(r.Constructor.constructorId),
            best_lap_time: this.parseLapTimeToSeconds(r.FastestLap?.Time?.time),
            lap_count: parseInt(r.laps, 10),
            status: r.status,
            race_name: race.raceName ?? "",
            round: parseInt(race.round, 10),
        }));
        await this.setStateAsync("results.race", { val: JSON.stringify(results, null, 2), ack: true });
    }
    async updateQualifyingResults() {
        const data = await this.fetchErgast("/current/last/qualifying.json?limit=100");
        const race = data?.MRData?.RaceTable?.Races?.[0];
        if (!race) {
            this.log.debug("No qualifying results from Ergast");
            return null;
        }
        const round = parseInt(race.round, 10);
        const results = race.QualifyingResults.map(r => ({
            position: parseInt(r.position, 10),
            driver_number: parseInt(r.number, 10),
            name_acronym: r.Driver.code ?? "",
            full_name: `${r.Driver.givenName} ${r.Driver.familyName}`,
            team_name: r.Constructor.name,
            team_colour: this.getTeamColour(r.Constructor.constructorId),
            best_lap_time: this.parseLapTimeToSeconds(r.Q3 ?? r.Q2 ?? r.Q1),
            lap_count: 0,
            q1: r.Q1,
            q2: r.Q2,
            q3: r.Q3,
            race_name: race.raceName ?? "",
            round,
        }));
        await this.setStateAsync("results.qualifying", {
            val: JSON.stringify(results, null, 2),
            ack: true,
        });
        return round;
    }
    async updateSprintResults() {
        const data = await this.fetchErgast("/current/sprint.json?limit=100");
        const races = data?.MRData?.RaceTable?.Races ?? [];
        const race = races[races.length - 1];
        if (!race) {
            this.log.debug("No sprint results from Ergast");
            return;
        }
        const results = race.SprintResults.map(r => ({
            position: parseInt(r.positionText, 10) || 0,
            driver_number: parseInt(r.number, 10),
            name_acronym: r.Driver.code ?? "",
            full_name: `${r.Driver.givenName} ${r.Driver.familyName}`,
            team_name: r.Constructor.name,
            team_colour: this.getTeamColour(r.Constructor.constructorId),
            best_lap_time: null,
            lap_count: parseInt(r.laps, 10),
            status: r.status,
            race_name: race.raceName ?? "",
            round: parseInt(race.round, 10),
        }));
        await this.setStateAsync("results.sprint", { val: JSON.stringify(results, null, 2), ack: true });
    }
    async updatePracticeResults(round, stateId, num) {
        const data = await this.fetchErgast(`/current/${round}/practice/${num}.json`);
        const race = data?.MRData?.RaceTable?.Races?.[0];
        if (!race?.PracticeResults?.length) {
            this.log.debug(`No Practice ${num} results for round ${round}`);
            return;
        }
        const results = race.PracticeResults.map(r => ({
            position: parseInt(r.position, 10),
            driver_number: parseInt(r.number, 10),
            name_acronym: r.Driver.code ?? "",
            full_name: `${r.Driver.givenName} ${r.Driver.familyName}`,
            team_name: r.Constructor.name,
            team_colour: this.getTeamColour(r.Constructor.constructorId),
            best_lap_time: this.parseLapTimeToSeconds(r.time),
            lap_count: parseInt(r.laps, 10),
            race_name: race.raceName ?? "",
            round,
        }));
        await this.setStateAsync(`results.${stateId}`, {
            val: JSON.stringify(results, null, 2),
            ack: true,
        });
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    /**
     * Deep merge two plain objects (for SignalR incremental updates)
     *
     * @param target - The target object to merge into
     * @param source - The source object to merge from
     */
    deepMerge(target, source) {
        const result = { ...target };
        for (const [key, val] of Object.entries(source)) {
            if (val !== null &&
                typeof val === "object" &&
                !Array.isArray(val) &&
                result[key] !== null &&
                typeof result[key] === "object" &&
                !Array.isArray(result[key])) {
                result[key] = this.deepMerge(result[key], val);
            }
            else {
                result[key] = val;
            }
        }
        return result;
    }
    parseLapTimeToSeconds(timeStr) {
        if (!timeStr) {
            return null;
        }
        const parts = timeStr.split(":");
        if (parts.length === 2) {
            return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
        }
        const val = parseFloat(timeStr);
        return isNaN(val) ? null : val;
    }
    getTeamColour(constructorId) {
        const colours = {
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
            sauber: "52E252",
            kick_sauber: "52E252",
            audi: "52E252",
        };
        return colours[constructorId] ?? "FFFFFF";
    }
}
if (require.main !== module) {
    module.exports = (options) => new F1(options);
}
else {
    (() => new F1())();
}
//# sourceMappingURL=main.js.map