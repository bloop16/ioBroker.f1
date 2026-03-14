"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateMapper = void 0;
const STATIC_BASE = "https://livetiming.formula1.com/static/";
// Deep-merge utility for partial SignalR diff payloads
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        const src = source[key];
        const tgt = result[key];
        if (src !== null &&
            typeof src === "object" &&
            !Array.isArray(src) &&
            typeof tgt === "object" &&
            tgt !== null &&
            !Array.isArray(tgt)) {
            result[key] = deepMerge(tgt, src);
        }
        else if (src !== undefined) {
            result[key] = src;
        }
    }
    return result;
}
class StateMapper {
    // In-memory diff state
    timingState = {};
    timingAppState = {};
    pitState = {};
    rcMessages = {};
    driverList = {};
    radioCaptures = [];
    prevPositions = {};
    overtakes = [];
    reset() {
        this.timingState = {};
        this.timingAppState = {};
        this.pitState = {};
        this.rcMessages = {};
        this.driverList = {};
        this.radioCaptures = [];
        this.prevPositions = {};
        this.overtakes = [];
    }
    async handle(adapter, topic, data, timestamp) {
        try {
            switch (topic) {
                case "WeatherData":
                    await this.handleWeather(adapter, data);
                    break;
                case "SessionStatus":
                    await this.handleSessionStatus(adapter, data);
                    break;
                case "TrackStatus":
                    await this.handleTrackStatus(adapter, data);
                    break;
                case "LapCount":
                    await this.handleLapCount(adapter, data);
                    break;
                case "SessionInfo":
                    await this.handleSessionInfo(adapter, data);
                    break;
                case "DriverList":
                    this.handleDriverList(data);
                    break;
                case "TimingData":
                    await this.handleTimingData(adapter, data, timestamp);
                    break;
                case "TimingAppData":
                    await this.handleTimingAppData(adapter, data);
                    break;
                case "PitStopSeries":
                    await this.handlePitStops(adapter, data);
                    break;
                case "TeamRadio":
                    await this.handleTeamRadio(adapter, data);
                    break;
                case "RaceControlMessages":
                    await this.handleRaceControl(adapter, data);
                    break;
                case "ChampionshipPrediction":
                    await this.handleChampionship(adapter, data);
                    break;
                default:
                    // Heartbeat, ExtrapolatedClock, TopThree, SessionData, TyreStintSeries, DriverRaceInfo — watchdog handled in SignalRClient
                    break;
            }
        }
        catch (err) {
            adapter.log.debug(`StateMapper [${topic}]: ${err.message}`);
        }
    }
    // ----------------------------------------------------------------
    async handleWeather(adapter, data) {
        if (!data || !Object.keys(data).length)
            return;
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
    async handleSessionStatus(adapter, data) {
        if (!data?.Status)
            return;
        const statusMap = {
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
    async handleTrackStatus(adapter, data) {
        if (!data?.Message)
            return;
        await adapter.setStateAsync("live_session.track_status", { val: data.Message, ack: true });
    }
    async handleLapCount(adapter, data) {
        const total = data?.TotalLaps ?? data?.CurrentLap;
        if (total !== undefined) {
            await adapter.setStateAsync("live_session.laps_total", { val: total, ack: true });
        }
    }
    async handleSessionInfo(adapter, data) {
        if (!data)
            return;
        if (data.Name) {
            await adapter.setStateAsync("live_session.type", { val: data.Name, ack: true });
        }
    }
    handleDriverList(data) {
        if (!data)
            return;
        for (const [num, entry] of Object.entries(data)) {
            if (entry && typeof entry === "object") {
                this.driverList[num] = { ...this.driverList[num], ...entry };
            }
        }
    }
    async handleTimingData(adapter, data, timestamp) {
        if (!data?.Lines)
            return;
        // Deep-merge diffs into in-memory state
        for (const [num, line] of Object.entries(data.Lines)) {
            if (line && typeof line === "object") {
                this.timingState[num] = deepMerge(this.timingState[num] ?? {}, line);
            }
        }
        // Build positions array from merged state
        const positions = Object.entries(this.timingState)
            .filter(([, line]) => line.Position)
            .map(([num, line]) => {
            const l = line;
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
            .filter(([, line]) => line.LastLapTime?.Value)
            .map(([num, line]) => {
            const l = line;
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
    async detectOvertakes(positions, timestamp, adapter) {
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
    async handleTimingAppData(adapter, data) {
        if (!data?.Lines)
            return;
        for (const [num, line] of Object.entries(data.Lines)) {
            if (line && typeof line === "object") {
                this.timingAppState[num] = deepMerge(this.timingAppState[num] ?? {}, line);
            }
        }
        const allStints = [];
        const currentTyres = [];
        for (const [num, line] of Object.entries(this.timingAppState)) {
            const stints = line.Stints;
            if (!stints)
                continue;
            const stintEntries = Object.entries(stints);
            let maxIndex = -1;
            for (const [idx, stint] of stintEntries) {
                const s = stint;
                const stintNum = parseInt(idx);
                if (s.Compound) {
                    allStints.push({
                        driver_number: num,
                        stint_number: stintNum,
                        compound: s.Compound,
                        total_laps: s.TotalLaps ?? 0,
                        new_tyre: s.New === "true",
                    });
                    if (stintNum > maxIndex)
                        maxIndex = stintNum;
                }
            }
            if (maxIndex >= 0 && stints[maxIndex]) {
                const latest = stints[maxIndex];
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
    async handlePitStops(adapter, data) {
        if (!data?.Lines)
            return;
        for (const [num, stops] of Object.entries(data.Lines)) {
            if (stops && typeof stops === "object") {
                this.pitState[num] = deepMerge(this.pitState[num] ?? {}, stops);
            }
        }
        const allPits = [];
        for (const [num, stops] of Object.entries(this.pitState)) {
            for (const [idx, stop] of Object.entries(stops)) {
                const s = stop;
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
    async handleTeamRadio(adapter, data) {
        if (!data?.Captures?.length)
            return;
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
    async handleRaceControl(adapter, data) {
        if (!data?.Messages)
            return;
        this.rcMessages = deepMerge(this.rcMessages, data.Messages);
        const msgs = Object.values(this.rcMessages)
            .map(m => {
            const msg = m;
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
    async handleChampionship(adapter, data) {
        // Update standings during session only if Jolpica data isn't available yet
        if (!data?.Drivers)
            return;
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
exports.StateMapper = StateMapper;
//# sourceMappingURL=state-mapper.js.map