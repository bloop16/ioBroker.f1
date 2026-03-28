# Design: Standings-Fix & Session-Ergebnisse

**Datum:** 2026-03-28
**Status:** Genehmigt
**Betrifft:** `src/main.ts`

---

## Problemstellung

### Problem 1 — Standings-API (401/429)
`updateStandings()` ruft `api.jolpi.ca/ergast` bei **jedem** `fetchData()`-Zyklus auf. Da Championship-Punkte sich nur nach einem Rennen ändern, führt das zu unnötigen Anfragen und Rate-Limit-Fehlern (HTTP 429) sowie Authentifizierungsfehlern (HTTP 401).

### Problem 2 — Leere Session-Ergebnisse
Es gibt keine Funktion zum Abrufen abgeschlossener Session-Ergebnisse (FP1/FP2/FP3/Sprint/Qualifying/Race). Nur Live-Daten einer aktiven Session werden erfasst. Nach Sessionende bleiben alle Datenpunkte leer.

---

## Lösungsdesign

### Standings — Event-gesteuerter Aufruf

`updateStandings()` wird **nur noch nach dem Ende einer Race-Session** aufgerufen, nicht mehr bei jedem Polling-Zyklus.

**Triggerlogik:**
1. In `updateLiveSession()`: wenn Session-Status von `active` → `finished` wechselt **und** `session_type === "Race"`, wird `updateStandings()` aufgerufen.
2. Beim Adapter-Start (`onReady`): einmalig aufrufen, wenn `standings.last_update` null ist **oder** älter als 7 Tage (nach einem Rennen aktualisiert → max. 1× pro Woche nötig).

**Retry mit exponentialem Backoff:**
- Max. 3 Versuche
- Wartezeit: 5s → 15s → 45s
- Bei dauerhaftem Fehler: Fehlermeldung ins Log, kein weiterer Retry bis zum nächsten Trigger

```
Retry-Logik (Pseudocode):
  delays = [5s, 15s, 45s]
  for attempt 0..2:
    try: await fetchStandings()
    on 429/401: wait(delays[attempt]), continue
    on success: break
    on other error: break
```

---

### Session-Ergebnisse — Neuer Channel `session_results`

#### States (je ein JSON-Array pro Session-Typ):

| State-ID | Beschreibung |
|---|---|
| `session_results.fp1` | FP1-Ergebnis (Fahrer, Bestzeit, Rundenanzahl) |
| `session_results.fp2` | FP2-Ergebnis |
| `session_results.fp3` | FP3-Ergebnis |
| `session_results.sprint_qualifying` | Sprint Shootout (Qualifying-Zeiten für Sprint) |
| `session_results.sprint` | Sprint-Rennergebnis (Position, Fahrer, Status) |
| `session_results.qualifying` | Qualifying-Ergebnis (Bestzeit + Gridposition, kein Q1/Q2/Q3-Split) |
| `session_results.race` | Rennergebnis (Position, Fahrer, Rundenanzahl, Status) |
| `session_results.last_update` | Zeitstempel der letzten Aktualisierung |

#### JSON-Format für Practice/Sprint/Sprint-Qualifying/Qualifying:
```json
[
  {
    "position": 1,
    "driver_number": 1,
    "name_acronym": "VER",
    "full_name": "Max Verstappen",
    "team_name": "Red Bull Racing",
    "team_colour": "3671C6",
    "best_lap_time": 83.456,
    "lap_count": 24
  }
]
```

#### JSON-Format für Race:
```json
[
  {
    "position": 1,
    "driver_number": 1,
    "name_acronym": "VER",
    "full_name": "Max Verstappen",
    "team_name": "Red Bull Racing",
    "team_colour": "3671C6",
    "best_lap_time": 83.456,
    "lap_count": 57,
    "status": "Finished"
  }
]
```

**Hinweis Qualifying:** OpenF1 liefert kein explizites Q-Segment-Feld. Kein Q1/Q2/Q3-Split — nur Bestzeit pro Fahrer, sortiert nach `best_lap_time` (= Gridposition).

#### Datenquelle (OpenF1):
- `/sessions?session_key=X` → Session-Typ ermitteln
- `/laps?session_key=X` → Rundenzeiten aller Fahrer
- `/drivers?session_key=X` → Fahrerdaten (Name, Team, Farbe)

#### Session-Typ Mapping:
| OpenF1 `session_name` | State-Suffix |
|---|---|
| `Practice 1` | `fp1` |
| `Practice 2` | `fp2` |
| `Practice 3` | `fp3` |
| `Sprint` | `sprint` |
| `Sprint Shootout` | `sprint_qualifying` |
| `Qualifying` | `qualifying` |
| `Race` | `race` |

---

### Polling-Verhalten

`updateSessionResults()` ist **event-gesteuert**, nicht im kontinuierlichen Polling-Block. Ergebnisse einer abgeschlossenen Session ändern sich nicht mehr — ständiges Abfragen wäre verschwendete API-Last.

**Trigger:** In `updateLiveSession()`, beim Statuswechsel `active` → `finished`:

```
updateLiveSession():
  neuer Status = berechne(now, sessionStart, sessionEnd)
  if vorheriger Status == "active" AND neuer Status == "finished":
    await updateSessionResults(session_key, session_name)
    if session_name == "Race":
      await updateStandings()   ← ebenfalls hier
```

**Anti-Duplikat-Mechanismus:** Ein In-Memory-State `private lastCompletedSessionKey?: number` in der Klasse speichert den Session-Key der zuletzt verarbeiteten Session. Trigger-Bedingung: `session_key !== this.lastCompletedSessionKey`. Nach dem Trigger wird `lastCompletedSessionKey = session_key` gesetzt. Bei Adapter-Neustart ist der Wert `undefined` → Trigger feuert beim nächsten `active → finished`-Übergang korrekt.

**Adapter-Start während laufender Session:** Falls `checkActiveSession()` beim Start eine aktive Session findet (`currentSessionKey` gesetzt), wird `updateSessionResults()` **nicht** sofort aufgerufen — erst beim tatsächlichen Sessionende. Bereits gespeicherte Ergebnisse früherer Sessions bleiben erhalten.

---

## State-Initialisierung

`initializeStates()` wird um den `session_results`-Channel erweitert:

```typescript
await setObjectNotExistsAsync("session_results", { type: "channel", ... })
// + je ein State für fp1, fp2, fp3, sprint, qualifying, race, last_update
```

---

## Nicht verändert

- OpenF1 API-Client (`this.api`) — unverändert
- Ergast/jolpi.ca URL-Konstanten — unverändert, nur Aufrufzeitpunkt ändert sich
- Alle bestehenden Live-Update-Funktionen — unverändert
- Polling-Interval-Logik — unverändert

---

## Zusammenfassung der Änderungen

| Datei | Änderung |
|---|---|
| `src/main.ts` | `updateStandings()`: Retry-Logik + event-gesteuerter Aufruf |
| `src/main.ts` | `updateLiveSession()`: Race-finished-Trigger für Standings |
| `src/main.ts` | `initializeStates()`: `session_results`-Channel hinzufügen |
| `src/main.ts` | `updateLiveSession()`: Session-finished-Trigger für `updateSessionResults()` |
| `src/main.ts` | Neue Methode `updateSessionResults(sessionKey, sessionName)` |
| `src/main.ts` | Neuer In-Memory-State `lastCompletedSessionKey` in der Klasse |
