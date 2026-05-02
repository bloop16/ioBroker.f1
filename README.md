# ioBroker.f1

[![NPM version](https://img.shields.io/npm/v/iobroker.f1.svg)](https://www.npmjs.com/package/iobroker.f1)
[![Downloads](https://img.shields.io/npm/dm/iobroker.f1.svg)](https://www.npmjs.com/package/iobroker.f1)
[![License](https://img.shields.io/github/license/bloop16/ioBroker.f1.svg)](https://github.com/bloop16/ioBroker.f1/blob/main/LICENSE)

Formula 1 live data integration for ioBroker — race calendar, standings, session results and real-time live data via the official F1 Live Timing feed.

## Features

- **Race Calendar** — Next race & session info with countdown (days/hours)
- **Full Season Calendar** — All rounds of the current season as JSON
- **Championship Standings** — Driver and constructor standings with points and wins
- **Session Results** — Race, qualifying, sprint, and all three practice sessions
- **Live Session Data** — Real-time data via F1 Live Timing SignalR WebSocket
  - Track status (AllClear / Yellow / SafetyCar / VSC / RedFlag)
  - Session status and name
  - Current & total laps
  - Time remaining / elapsed
  - Track weather (air temp, track temp, rain, wind, humidity)
  - Driver positions with gaps, lap times and tyre info
  - Top 3 live leaderboard
  - Race control messages
  - Pit stops
  - Tyre compounds per driver
  - Team radio

## Data Points

```
f1.0
├── info.connection
├── schedule/
│   ├── next_race_name / round / circuit / country / date / countdown_days
│   ├── next_session_name / type / date / countdown_hours
│   ├── weekend_json          (all sessions of current weekend as JSON)
│   └── calendar              (full season calendar as JSON)
├── standings/
│   ├── drivers               (JSON array)
│   ├── teams                 (JSON array)
│   └── last_update
├── results/
│   ├── race / qualifying / sprint   (JSON arrays)
│   └── last_update
└── live/                     (only active during session ±30 min)
    ├── is_live / session_name / session_status / track_status
    ├── laps_current / laps_total
    ├── time_remaining / time_elapsed
    ├── weather / race_control / top_three
    ├── drivers / tyres / pit_stops / team_radio
    └── last_update
```

## Data Sources

| Channel | Source | Update |
|---|---|---|
| `schedule/` | Jolpica API (ergast.com fallback) | Hourly |
| `standings/` | Jolpica API (ergast.com fallback) | Hourly / after race |
| `results/` | Jolpica API (ergast.com fallback) | Hourly / after each session |
| `live/` | F1 Live Timing SignalR WebSocket | Real-time push |

## Requirements

- ioBroker >= 5.0.19
- Node.js >= 20
- Internet connection

## Changelog

### 0.1.6 (2026-05-02)

- (bloop) Remove: `results.fp1`, `results.fp2`, `results.fp3` states — Jolpica/Ergast API does not provide practice session results
- (bloop) Remove: `results.sprint_qualifying` state — Jolpica/Ergast API does not expose a sprint qualifying endpoint (HTTP 400)

### 0.1.5 (2026-05-02)

- (bloop) Fix: per-session result loading — each session is loaded independently when its scheduled time has passed
- (bloop) Fix: race result buffer increased to 180 min (was 90 min) to account for race duration + API publishing delay
- (bloop) Fix: `weekend_json` now shows the currently active race weekend instead of always the next upcoming race
- (bloop) Fix: `checkLiveStatus` no longer re-fetches the Jolpica schedule API every 60 s — uses cached data from hourly refresh
- (bloop) Fix: sprint qualifying and practice states are now explicitly set to `null` when the API endpoint is unavailable
- (bloop) Fix: double-Z bug in date parsing (`new Date("...Z"+"Z")` → Invalid Date) that caused round detection to always return null
- (bloop) Add: `is_sprint_weekend` flag in `schedule.calendar` JSON entries
- (bloop) Remove: unused internal `SIGNALR_BASE` constant

### 0.1.4 (2026-04-15)

- (bloop) Removed VIS1 widgets (development discontinued)

### 0.1.3 (2026-03-29)

- (bloop) Complete adapter rewrite — new clean 4-channel data structure
- (bloop) Replaced OpenF1 REST polling with F1 Live Timing SignalR WebSocket (real-time push)
- (bloop) Replaced OpenF1 schedule with Jolpica/Ergast API (more reliable, works outside race weekends)
- (bloop) Added automatic fallback from Jolpica to ergast.com on connectivity issues
- (bloop) Added 404-safe result fetching — partial failures no longer block other results
- (bloop) New data points: time_remaining, time_elapsed, laps_current, top_three, team_radio, full season calendar
- (bloop) Live session detection via schedule timing (±30 min window)
- (bloop) Automatic result & standings refresh on session end
- (bloop) Removed telemetry/car-data/location endpoints (not available outside active sessions)

### 0.1.2 (2026-03-23)

- (bloop) Widget development (discontinued in 0.1.4)

### 0.1.1 (2026-03-22)

- (bloop) Removed unused widgets
- (bloop) Fixed repository checker findings for Dependabot and CI
- (bloop) Added missing translations and maintenance metadata

### 0.1.0 (2026-03-15)

- (bloop) Initial release
- (bloop) Live F1 data from OpenF1 API
- (bloop) Next race info, standings, live session data

## License

MIT License

Copyright (c) 2026 Martin (bloop) <bloop16@hotmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Disclaimer

This project is **not affiliated** with, endorsed by, or in any way officially connected with Formula 1, the FIA, or any of their subsidiaries or affiliates.

**F1®**, **FORMULA ONE®**, **FORMULA 1®**, **FIA FORMULA ONE WORLD CHAMPIONSHIP®**, **GRAND PRIX®** and related marks are trademarks of Formula One Licensing B.V.

This adapter is intended for personal, non-commercial use only. Data is sourced from [Jolpica](https://api.jolpi.ca/) (Ergast mirror) and the official F1 Live Timing feed.
