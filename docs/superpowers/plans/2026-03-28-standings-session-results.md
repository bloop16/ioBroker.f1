# Standings-Fix & Session-Ergebnisse — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standings-API-Fehler (429/401) beheben, kritische Bugs in der Polling-Logik fixen und Session-Ergebnisse (FP1/FP2/FP3/Sprint/Qualifying/Race) als neue ioBroker-States implementieren.

**Architecture:** Alle Änderungen in `src/main.ts`. Standings werden event-gesteuert (nur nach Rennen-Ende) mit Retry-Logik aufgerufen. Session-Ergebnisse werden nach Sessionende via `updateSessionResults()` gespeichert, getriggert durch einen `active → finished`-Übergang in `updateLiveSession()`. Kritische Bugs (Startup-Reihenfolge, parallele Ausführung) werden zuerst behoben.

**Tech Stack:** TypeScript, ioBroker Adapter Core (`@iobroker/adapter-core`), axios, Mocha (bestehende Test-Infrastruktur unter `test/`)

**Spec:** `docs/superpowers/specs/2026-03-28-standings-session-results-design.md`

---

## Dateien

| Datei | Änderung |
|-------|----------|
| `src/main.ts` | Alle Änderungen (Bugs + neue Features) |
| `test/unit.js` | Ggf. erweitern wenn custom unit tests ergänzt werden |

---

## Task 1: Kritischer Bug — Startup-Reihenfolge

`fetchData()` wird in `onReady()` vor `checkActiveSession()` aufgerufen. Dadurch ist `currentSessionKey` beim ersten Start immer `undefined` und Live-Daten werden nie geladen.

**Dateien:**
- Modify: `src/main.ts:153-159` (`onReady()`)

- [ ] **Step 1.1: Fix — `onReady()` Reihenfolge korrigieren**

Ändere `onReady()` so, dass `updatePollingInterval()` (welches `checkActiveSession()` enthält) **vor** `fetchData()` aufgerufen wird:

```typescript
private async onReady(): Promise<void> {
    this.log.info("Starting F1 adapter...");
    await this.initializeStates();
    await this.setStateAsync("info.connection", { val: false, ack: true });
    await this.updatePollingInterval(); // checkActiveSession() läuft hier → currentSessionKey gesetzt
    await this.fetchData();             // jetzt mit korrektem currentSessionKey
}
```

- [ ] **Step 1.2: Bauen und prüfen**

```bash
cd /home/martin/iobroker.f1 && npm run build
```

Erwartung: Build erfolgreich, keine TypeScript-Fehler.

- [ ] **Step 1.3: Commit**

```bash
git add src/main.ts
git commit -m "fix: call checkActiveSession before fetchData on startup"
```

---

## Task 2: Kritischer Bug — Parallele Fetch-Ausführung verhindern

`setInterval` wartet nicht auf `async fetchData()`. Bei langsamen APIs können mehrere Zyklen gleichzeitig laufen.

**Dateien:**
- Modify: `src/main.ts` — Klassen-Properties und `updatePollingInterval()`

- [ ] **Step 2.1: `isFetching`-Guard hinzufügen**

Füge eine neue Klassen-Property hinzu (nach `currentSessionKey`):

```typescript
private isFetching: boolean = false;
```

Wrape `fetchData()` mit dem Guard:

```typescript
private async fetchData(): Promise<void> {
    if (this.isFetching) {
        this.log.debug("Fetch already running, skipping cycle");
        return;
    }
    this.isFetching = true;
    try {
        // ... bestehender Code unverändert ...
    } finally {
        this.isFetching = false;
    }
}
```

- [ ] **Step 2.2: Bauen und prüfen**

```bash
npm run build
```

Erwartung: Build erfolgreich.

- [ ] **Step 2.3: Commit**

```bash
git add src/main.ts
git commit -m "fix: prevent concurrent fetchData execution with isFetching guard"
```

---

## Task 3: HIGH Bug — `checkActiveSession()` Fehlerfall setzt `currentSessionKey` nicht zurück

Wenn `checkActiveSession()` eine Exception wirft, bleibt `currentSessionKey` auf dem alten (veralteten) Wert.

**Dateien:**
- Modify: `src/main.ts:192-237` (`checkActiveSession()`)

- [ ] **Step 3.1: Catch-Block fixen**

Ändere den `catch`-Block in `checkActiveSession()`:

```typescript
} catch {
    this.log.debug("Failed to check active session");
    this.currentSessionKey = undefined; // ← neu: alten Key verwerfen
    return false;
}
```

- [ ] **Step 3.2: Bauen und prüfen**

```bash
npm run build
```

- [ ] **Step 3.3: Commit**

```bash
git add src/main.ts
git commit -m "fix: reset currentSessionKey on checkActiveSession error"
```

---

## Task 4: HIGH Bug — Dreifache `/sessions` API-Anfragen pro Zyklus zusammenführen

`getNextRace()`, `getNextSession()` und `getWeekendSessions()` rufen alle denselben `/sessions?year=X`-Endpoint auf. Zusammenfassen zu einem einzigen Call.

**Dateien:**
- Modify: `src/main.ts` — `fetchData()`, `getNextRace()`, `getNextSession()`, `getWeekendSessions()`

- [ ] **Step 4.1: Gemeinsame Session-Daten-Methode extrahieren**

> **Trade-off:** Bisher nutzte `getNextRace()` den serverseitigen Filter `session_name: "Race"`. Der neue Ansatz lädt alle Sessions des Jahres in einem Call und filtert clientseitig. Das reduziert 3 API-Calls auf 1, lädt aber alle Sessions (~100–200 Einträge/Jahr) statt nur Race-Sessions. Das ist akzeptabel — OpenF1-Antworten für `/sessions?year=X` sind klein (JSON, keine Telemetrie).

Füge eine private Hilfsmethode ein:

```typescript
private async fetchAllSessionsForYear(year: number): Promise<NextRace[]> {
    const response = await this.api.get<NextRace[]>("/sessions", {
        params: { year },
    });
    return response.data ?? [];
}
```

- [ ] **Step 4.2: `fetchData()` anpassen — Daten einmal laden, dreifach verwenden**

```typescript
private async fetchData(): Promise<void> {
    if (this.isFetching) {
        this.log.debug("Fetch already running, skipping cycle");
        return;
    }
    this.isFetching = true;
    try {
        this.log.debug("Fetching data from OpenF1 API...");

        const now = new Date();
        const allSessions = await this.fetchAllSessionsForYear(now.getFullYear());

        const nextRace = this.findNextRace(allSessions, now);
        if (nextRace) {
            await this.updateNextRaceStates(nextRace);

            const nextSession = this.findNextSession(allSessions, now);
            if (nextSession) {
                await this.updateNextSession(nextSession);
            }

            const weekendSessions = this.buildWeekendSessions(allSessions, now);
            if (weekendSessions) {
                await this.updateWeekendSessions(weekendSessions);
            }
        }

        await this.updateStandingsIfNeeded();

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
    } finally {
        this.isFetching = false;
    }
}
```

- [ ] **Step 4.3: `getNextRace()` → `findNextRace()` (synchron, kein API-Call)**

```typescript
private findNextRace(sessions: NextRace[], now: Date): NextRace | null {
    const futureRaces = sessions
        .filter(s => s.session_name === "Race" && new Date(s.date_start) > now)
        .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());
    return futureRaces[0] ?? null;
}
```

- [ ] **Step 4.4: `getNextSession()` → `findNextSession()` (synchron)**

```typescript
private findNextSession(sessions: NextRace[], now: Date): NextRace | null {
    const future = sessions
        .filter(s => new Date(s.date_start) > now)
        .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());
    return future[0] ?? null;
}
```

- [ ] **Step 4.5: `getWeekendSessions()` → `buildWeekendSessions()` (synchron)**

> **Verhalten unverändert:** Die bestehende `getWeekendSessions()` nutzt dieselbe `circuit_short_name`-Heuristik mit 7-Tage-Fenster. Kein Behaviour-Change — nur die Async-API-Call wird durch Übergabe der bereits geladenen Daten ersetzt.

```typescript
private buildWeekendSessions(sessions: NextRace[], now: Date): WeekendSessions | null {
    const future = sessions
        .filter(s => new Date(s.date_start) > now)
        .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());

    if (future.length === 0) return null;

    const first = future[0];
    const weekendEnd = new Date(new Date(first.date_start).getTime() + 7 * 24 * 60 * 60 * 1000);

    const weekendList = future.filter(s =>
        s.circuit_short_name === first.circuit_short_name &&
        new Date(s.date_start) <= weekendEnd,
    );

    return {
        circuit: first.circuit_short_name,
        country: first.country_name,
        location: first.location,
        year: first.year,
        sessions: weekendList,
        next_session_index: 0,
    };
}
```

- [ ] **Step 4.6: Alte async Methoden entfernen** (`getNextRace`, `getNextSession`, `getWeekendSessions`)

- [ ] **Step 4.7: Bauen und prüfen**

```bash
npm run build
```

Erwartung: Keine TypeScript-Fehler.

- [ ] **Step 4.8: Commit**

```bash
git add src/main.ts
git commit -m "refactor: consolidate /sessions API calls into single fetch per cycle"
```

---

## Task 5: HIGH Bug — `updatePositions()` Deduplizierung pro Fahrer

Aktuell werden die 20 neuesten Datenpunkte genommen — möglicherweise mehrere vom selben Fahrer. Fix: pro Fahrer nur den neuesten Eintrag behalten.

**Dateien:**
- Modify: `src/main.ts` — `updatePositions()`

- [ ] **Step 5.1: Deduplizierungs-Logik einbauen**

Ersetze in `updatePositions()` den Block ab `const latestPositions`:

```typescript
// Neuesten Eintrag pro Fahrer ermitteln
const sorted = posResponse.data
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const seen = new Set<number>();
const latestPositions: Position[] = [];
for (const entry of sorted) {
    if (!seen.has(entry.driver_number)) {
        seen.add(entry.driver_number);
        latestPositions.push(entry);
    }
}
latestPositions.sort((a, b) => a.position - b.position);
```

- [ ] **Step 5.2: Bauen**

```bash
npm run build
```

- [ ] **Step 5.3: Commit**

```bash
git add src/main.ts
git commit -m "fix: deduplicate position data per driver in updatePositions"
```

---

## Task 6: HIGH Bug — `countdown_days` Rundung vereinheitlichen

`next_race` nutzt `Math.ceil`, `next_session` nutzt `Math.floor`. Beide auf `Math.ceil` vereinheitlichen.

**Dateien:**
- Modify: `src/main.ts` — `updateNextSession()` (Zeile ~1253)

- [ ] **Step 6.1: `Math.floor` → `Math.ceil` in `updateNextSession()`**

```typescript
const daysUntil = Math.ceil((new Date(session.date_start).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
```

- [ ] **Step 6.2: Bauen und Commit**

```bash
npm run build
git add src/main.ts
git commit -m "fix: unify countdown_days rounding to Math.ceil"
```

---

## Task 7: Standings — Event-gesteuert + Retry-Logik

`updateStandings()` wird nicht mehr in jedem `fetchData()`-Zyklus aufgerufen, sondern nur:
- Nach Ende einer Race-Session
- Beim Adapter-Start, wenn `standings.last_update` null oder älter als 7 Tage

**Dateien:**
- Modify: `src/main.ts` — neue `updateStandingsIfNeeded()`, `updateStandings()` mit Retry, neuer axios-Client mit Timeout

- [ ] **Step 7.1: Ergast-Client mit Timeout im Constructor hinzufügen**

Füge im Constructor (nach `this.api = axios.create(...)`) ein — konsistent mit dem bestehenden Stil:

```typescript
this.ergastApi = axios.create({
    timeout: 10000,
    headers: { "User-Agent": "ioBroker.f1" },
});
```

Und in den Klassen-Properties (nach `private api`):

```typescript
private ergastApi: ReturnType<typeof axios.create>;
```

- [ ] **Step 7.2: `updateStandings()` auf `ergastApi` + parallele Requests umstellen**

```typescript
private async updateStandings(): Promise<void> {
    const delays = [5000, 15000, 45000];

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const [driverResponse, constructorResponse] = await Promise.all([
                this.ergastApi.get<any>(this.ERGAST_DRIVER_STANDINGS_URL),
                this.ergastApi.get<any>(this.ERGAST_CONSTRUCTOR_STANDINGS_URL),
            ]);

            const driverStandings =
                driverResponse.data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
            const constructorStandings =
                constructorResponse.data?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];

            if (driverStandings.length > 0) {
                const openF1Response = await this.api.get<Driver[]>("/drivers", {
                    params: { session_key: "latest" },
                });
                const openF1Drivers: Driver[] = openF1Response.data ?? [];

                const drivers = driverStandings.map((standing: any) => {
                    const driverNumber = parseInt(standing.Driver.permanentNumber);
                    const openF1Driver = openF1Drivers.find(d => d.driver_number === driverNumber);
                    return {
                        position: parseInt(standing.position),
                        driver_number: driverNumber,
                        full_name: standing.Driver.givenName + " " + standing.Driver.familyName,
                        name_acronym: standing.Driver.code ?? "",
                        team_name: standing.Constructors?.[0]?.name ?? "",
                        team_colour: this.getTeamColour(standing.Constructors?.[0]?.constructorId ?? ""),
                        points: parseFloat(standing.points),
                        wins: parseInt(standing.wins),
                        headshot_url: openF1Driver?.headshot_url ?? "",
                    };
                });

                await this.setStateAsync("standings.drivers", { val: JSON.stringify(drivers, null, 2), ack: true });
            }

            if (constructorStandings.length > 0) {
                const teams = constructorStandings.map((standing: any) => ({
                    position: parseInt(standing.position),
                    team_name: standing.Constructor.name,
                    team_colour: this.getTeamColour(standing.Constructor.constructorId),
                    points: parseFloat(standing.points),
                    wins: parseInt(standing.wins),
                }));
                await this.setStateAsync("standings.teams", { val: JSON.stringify(teams, null, 2), ack: true });
            }

            await this.setStateAsync("standings.last_update", { val: new Date().toISOString(), ack: true });
            this.log.debug("Updated standings from Ergast API");
            return; // Erfolg → kein weiterer Retry

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (attempt < 2) {
                this.log.warn(`Standings fetch failed (attempt ${attempt + 1}/3): ${message}. Retrying in ${delays[attempt] / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delays[attempt]));
            } else {
                this.log.error(`Failed to update standings after 3 attempts: ${message}`);
            }
        }
    }
}
```

- [ ] **Step 7.3: `updateStandingsIfNeeded()` hinzufügen**

```typescript
private async updateStandingsIfNeeded(): Promise<void> {
    const lastUpdateState = await this.getStateAsync("standings.last_update");
    const lastUpdate = lastUpdateState?.val as string | null;

    if (!lastUpdate) {
        this.log.debug("No standings data yet, fetching...");
        await this.updateStandings();
        return;
    }

    const ageMs = Date.now() - new Date(lastUpdate).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (ageMs > sevenDaysMs) {
        this.log.debug("Standings older than 7 days, refreshing...");
        await this.updateStandings();
    }
}
```

- [ ] **Step 7.4: `fetchData()` anpassen**

Ersetze `await this.updateStandings();` in `fetchData()` durch:

```typescript
await this.updateStandingsIfNeeded();
```

- [ ] **Step 7.5: Bauen und prüfen**

```bash
npm run build
```

- [ ] **Step 7.6: Commit**

```bash
git add src/main.ts
git commit -m "feat: event-driven standings with retry and 7-day cache"
```

---

## Task 8: Neuer Channel `session_results` — States initialisieren

**Dateien:**
- Modify: `src/main.ts` — `initializeStates()`

- [ ] **Step 8.1: `session_results`-Channel in `initializeStates()` hinzufügen**

Füge am Ende von `initializeStates()` ein:

```typescript
// Session Results
await this.setObjectNotExistsAsync("session_results", {
    type: "channel",
    common: { name: "Session Results" },
    native: {},
});

const sessionResultStates = [
    { id: "fp1", name: "Free Practice 1 Result" },
    { id: "fp2", name: "Free Practice 2 Result" },
    { id: "fp3", name: "Free Practice 3 Result" },
    { id: "sprint_qualifying", name: "Sprint Qualifying Result" },
    { id: "sprint", name: "Sprint Race Result" },
    { id: "qualifying", name: "Qualifying Result" },
    { id: "race", name: "Race Result" },
    { id: "last_update", name: "Last Update" },
];

for (const state of sessionResultStates) {
    await this.setObjectNotExistsAsync(`session_results.${state.id}`, {
        type: "state",
        common: {
            name: state.name,
            type: "string",
            role: state.id === "last_update" ? "date" : "json",
            read: true,
            write: false,
        },
        native: {},
    });
}
```

- [ ] **Step 8.2: Bauen**

```bash
npm run build
```

- [ ] **Step 8.3: Commit**

```bash
git add src/main.ts
git commit -m "feat: initialize session_results channel and states"
```

---

## Task 9: `updateSessionResults()` implementieren

**Dateien:**
- Modify: `src/main.ts` — neue Methode + neues Interface + neuer Klassen-State

- [ ] **Step 9.1: Interface für Session-Ergebnis-Eintrag hinzufügen**

Füge nach den bestehenden Interfaces ein:

```typescript
interface SessionResultEntry {
    position: number;
    driver_number: number;
    name_acronym: string;
    full_name: string;
    team_name: string;
    team_colour: string;
    best_lap_time: number | null;
    lap_count: number;
    status?: string;
}
```

- [ ] **Step 9.2: `lastCompletedSessionKey` Klassen-Property hinzufügen**

```typescript
private lastCompletedSessionKey?: number;
```

- [ ] **Step 9.3: Session-Typ-Mapping-Methode hinzufügen**

```typescript
private getSessionResultStateId(sessionName: string): string | null {
    const mapping: Record<string, string> = {
        "Practice 1": "fp1",
        "Practice 2": "fp2",
        "Practice 3": "fp3",
        "Sprint Shootout": "sprint_qualifying",
        "Sprint": "sprint",
        "Qualifying": "qualifying",
        "Race": "race",
    };
    return mapping[sessionName] ?? null;
}
```

- [ ] **Step 9.4: `updateSessionResults()` implementieren**

```typescript
private async updateSessionResults(sessionKey: number, sessionName: string): Promise<void> {
    const stateId = this.getSessionResultStateId(sessionName);
    if (!stateId) {
        this.log.debug(`No result state mapping for session: ${sessionName}`);
        return;
    }

    try {
        const [lapsResponse, driversResponse] = await Promise.all([
            this.api.get<Lap[]>("/laps", { params: { session_key: sessionKey } }),
            this.api.get<Driver[]>("/drivers", { params: { session_key: sessionKey } }),
        ]);

        const laps: Lap[] = lapsResponse.data ?? [];
        const drivers: Driver[] = driversResponse.data ?? [];

        if (laps.length === 0) {
            this.log.debug(`No lap data for session ${sessionName} (key: ${sessionKey})`);
            return;
        }

        // Bestzeit und Rundenanzahl pro Fahrer berechnen
        // is_pit_out_lap ausschließen (kein repräsentatives Zeitmaß für Quali/FP)
        const driverStats = new Map<number, { best: number | null; count: number }>();
        for (const lap of laps) {
            const existing = driverStats.get(lap.driver_number) ?? { best: null, count: 0 };
            const lapTime = lap.lap_duration > 0 && !lap.is_pit_out_lap ? lap.lap_duration : null;
            const newBest =
                lapTime !== null && (existing.best === null || lapTime < existing.best)
                    ? lapTime
                    : existing.best;
            driverStats.set(lap.driver_number, { best: newBest, count: existing.count + 1 });
        }

        // Ergebnis-Array aufbauen, nach Bestzeit sortieren
        const results: SessionResultEntry[] = Array.from(driverStats.entries())
            .map(([driverNumber, stats]) => {
                const driver = drivers.find(d => d.driver_number === driverNumber);
                return {
                    position: 0, // wird unten gesetzt
                    driver_number: driverNumber,
                    name_acronym: driver?.name_acronym ?? String(driverNumber),
                    full_name: driver?.full_name ?? String(driverNumber),
                    team_name: driver?.team_name ?? "",
                    team_colour: driver?.team_colour ?? "FFFFFF",
                    best_lap_time: stats.best,
                    lap_count: stats.count,
                };
            })
            .sort((a, b) => {
                if (a.best_lap_time === null) return 1;
                if (b.best_lap_time === null) return -1;
                return a.best_lap_time - b.best_lap_time;
            })
            .map((entry, index) => ({ ...entry, position: index + 1 }));

        await this.setStateAsync(`session_results.${stateId}`, {
            val: JSON.stringify(results, null, 2),
            ack: true,
        });
        await this.setStateAsync("session_results.last_update", {
            val: new Date().toISOString(),
            ack: true,
        });

        this.lastCompletedSessionKey = sessionKey;
        this.log.info(`Saved results for session: ${sessionName}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log.error(`Failed to update session results for ${sessionName}: ${message}`);
    }
}
```

- [ ] **Step 9.5: Bauen**

```bash
npm run build
```

- [ ] **Step 9.6: Commit**

```bash
git add src/main.ts
git commit -m "feat: implement updateSessionResults for all session types"
```

---

## Task 10: Trigger in `updateLiveSession()` — Session-Ende erkennen

**Dateien:**
- Modify: `src/main.ts` — `updateLiveSession()`

- [ ] **Step 10.1: Vorherigen Status in Klasse speichern**

Füge neue Klassen-Property hinzu:

```typescript
private lastLiveSessionStatus: string = "no_session";
```

- [ ] **Step 10.2: Trigger-Logik in `updateLiveSession()` einbauen**

Nach dem `await this.setStateAsync("live_session.status", ...)` Block:

```typescript
// Trigger: Session gerade beendet?
if (
    this.lastLiveSessionStatus === "active" &&
    status === "finished" &&
    session.session_key !== this.lastCompletedSessionKey
) {
    this.log.info(`Session finished: ${session.session_name}. Saving results...`);
    await this.updateSessionResults(session.session_key, session.session_name);
    if (session.session_name === "Race") {
        await this.updateStandings();
    }
}
this.lastLiveSessionStatus = status;
```

- [ ] **Step 10.3: Bauen**

```bash
npm run build
```

- [ ] **Step 10.4: Commit**

```bash
git add src/main.ts
git commit -m "feat: trigger session results and standings on session-finished event"
```

---

## Task 11: Smoke-Test und manuelle Verifikation

- [ ] **Step 11.1: Unit-Tests ausführen**

```bash
npm run test:unit
```

Erwartung: Alle Tests grün.

- [ ] **Step 11.2: Package-Tests ausführen**

```bash
npm run test:package
```

Erwartung: Alle Tests grün.

- [ ] **Step 11.3: Build-Artefakt prüfen**

```bash
npm run build && ls -la build/main.js
```

Erwartung: `build/main.js` vorhanden und aktuell.

- [ ] **Step 11.4: Adapter starten und Logs prüfen**

Starte den Adapter im dev-server und prüfe:
- Kein "Failed to update standings" beim Start (außer bei echtem API-Fehler)
- "Starting F1 adapter..." gefolgt von korrekter Polling-Initialisierung
- Neue States `session_results.*` erscheinen im ioBroker-Admin

- [ ] **Step 11.5: Abschluss-Commit (falls Kleinigkeiten nachgebessert)**

```bash
git add -p
git commit -m "chore: post-integration cleanup"
```

---

## Zusammenfassung der Änderungen

| Task | Typ | Beschreibung |
|------|-----|-------------|
| 1 | Fix CRITICAL | Startup-Reihenfolge: `updatePollingInterval` vor `fetchData` |
| 2 | Fix CRITICAL | `isFetching`-Guard verhindert parallele Ausführung |
| 3 | Fix HIGH | `currentSessionKey` bei Fehler zurücksetzen |
| 4 | Refactor HIGH | `/sessions` nur 1× pro Zyklus abfragen |
| 5 | Fix HIGH | Positionen: Deduplizierung pro Fahrer |
| 6 | Fix MEDIUM | `countdown_days`: `Math.ceil` vereinheitlichen |
| 7 | Feature | Standings: event-gesteuert + Retry + 7-Tage-Cache |
| 8 | Feature | `session_results`-States initialisieren |
| 9 | Feature | `updateSessionResults()` implementieren |
| 10 | Feature | `active → finished`-Trigger in `updateLiveSession()` |
| 11 | Test | Smoke-Test + manuelle Verifikation |
