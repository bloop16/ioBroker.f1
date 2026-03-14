"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionTracker = void 0;
// Estimated session durations in minutes
const SESSION_DURATIONS = {
    "Practice 1": 60,
    "Practice 2": 60,
    "Practice 3": 60,
    Qualifying: 60,
    "Sprint Qualifying": 60,
    Sprint: 35,
    Race: 130,
};
class SessionTracker {
    sessions = [];
    update(races) {
        this.sessions = [];
        for (const race of races) {
            const round = parseInt(race.round);
            const season = race.season;
            const circuitName = race.Circuit.circuitName;
            const country = race.Circuit.Location.country;
            const location = race.Circuit.Location.locality;
            const subSessions = [
                { key: "FirstPractice", name: "Practice 1" },
                { key: "SecondPractice", name: "Practice 2" },
                { key: "ThirdPractice", name: "Practice 3" },
                { key: "SprintQualifying", name: "Sprint Qualifying" },
                { key: "Sprint", name: "Sprint" },
                { key: "Qualifying", name: "Qualifying" },
            ];
            for (const { key, name } of subSessions) {
                const s = race[key];
                if (s) {
                    const dateStart = this.parseDateTime(s.date, s.time);
                    const dateEnd = new Date(dateStart.getTime() + (SESSION_DURATIONS[name] ?? 60) * 60_000);
                    this.sessions.push({
                        sessionName: name,
                        sessionType: name,
                        circuitName,
                        country,
                        location,
                        dateStart,
                        dateEnd,
                        round,
                        season,
                    });
                }
            }
            // Race
            const raceStart = this.parseDateTime(race.date, race.time);
            const raceEnd = new Date(raceStart.getTime() + SESSION_DURATIONS["Race"] * 60_000);
            this.sessions.push({
                sessionName: "Race",
                sessionType: "Race",
                circuitName,
                country,
                location,
                dateStart: raceStart,
                dateEnd: raceEnd,
                round,
                season,
            });
        }
        this.sessions.sort((a, b) => a.dateStart.getTime() - b.dateStart.getTime());
    }
    parseDateTime(date, time) {
        return new Date(time ? `${date}T${time}` : `${date}T00:00:00Z`);
    }
    getActiveSession() {
        const now = new Date();
        return this.sessions.find(s => now >= s.dateStart && now <= s.dateEnd) ?? null;
    }
    isSessionActive() {
        return this.getActiveSession() !== null;
    }
    isSessionImminent(minutesBefore = 30) {
        const now = new Date();
        const threshold = minutesBefore * 60_000;
        return this.sessions.some(s => {
            const ms = s.dateStart.getTime() - now.getTime();
            return ms > 0 && ms <= threshold;
        });
    }
    shouldConnectSignalR() {
        return this.isSessionActive() || this.isSessionImminent(30);
    }
    getNextSession() {
        const now = new Date();
        const active = this.getActiveSession();
        if (active)
            return active;
        return this.sessions.find(s => s.dateStart > now) ?? null;
    }
    getNextRace() {
        const now = new Date();
        return this.sessions.find(s => s.sessionType === "Race" && s.dateStart > now) ?? null;
    }
    getWeekendSessions() {
        const next = this.getNextSession();
        if (!next)
            return null;
        const round = next.round;
        const weekendSessions = this.sessions.filter(s => s.round === round);
        const now = new Date();
        const nextIndex = Math.max(0, weekendSessions.findIndex(s => s.dateStart > now || (now >= s.dateStart && now <= s.dateEnd)));
        return {
            circuit: next.circuitName,
            country: next.country,
            location: next.location,
            year: parseInt(next.season),
            sessions: weekendSessions,
            next_session_index: nextIndex,
        };
    }
    /** Return all races as meeting-like objects (for meetings.all state) */
    getMeetings(races) {
        return races.map(race => ({
            meeting_name: race.raceName,
            circuit_short_name: race.Circuit.circuitName,
            country_name: race.Circuit.Location.country,
            location: race.Circuit.Location.locality,
            date_start: race.FirstPractice?.date ?? race.date,
            date_end: race.date,
            year: parseInt(race.season),
            round: parseInt(race.round),
        }));
    }
}
exports.SessionTracker = SessionTracker;
//# sourceMappingURL=session-tracker.js.map