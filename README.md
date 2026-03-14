# ioBroker.f1

[![NPM version](https://img.shields.io/npm/v/iobroker.f1.svg)](https://www.npmjs.com/package/iobroker.f1)
[![Downloads](https://img.shields.io/npm/dm/iobroker.f1.svg)](https://www.npmjs.com/package/iobroker.f1)
[![License](https://img.shields.io/github/license/bloop16/ioBroker.f1.svg)](https://github.com/bloop16/ioBroker.f1/blob/main/LICENSE)

Unofficial Formula 1 live data adapter for ioBroker.

## Features

- **Race Calendar** — Next race and session with countdown
- **Championship Standings** — Driver and constructor standings (current season)
- **Weekend Schedule** — All sessions of the upcoming race weekend
- **Live Session** — Session status, track status, weather, lap count
- **Live Timing** — Positions, intervals, lap times, fastest laps
- **Pit Stops** — Per-driver stop history
- **Tyre Strategy** — Compound and stint data
- **Team Radio** — Audio messages with direct URL
- **Race Control** — Flags, safety car, penalties
- **Overtakes** — Derived from live position changes

## Data Sources

| Data | Source |
|---|---|
| Race calendar, standings | [Jolpica/Ergast API](https://api.jolpi.ca) — free, no authentication |
| Live session data | [F1 Live Timing](https://livetiming.formula1.com) via SignalR WebSocket — free |

The adapter connects to SignalR automatically **30 minutes before** each session and disconnects **5 minutes after** it ends. No polling during live sessions — all data is push-based.

## Data Points

### `next_race.*`
| State | Description |
|---|---|
| `circuit` | Circuit name |
| `country` | Country |
| `location` | City |
| `date_start` | Race start (ISO 8601) |
| `countdown_days` | Days until race |
| `json` | Full object as JSON |

### `next_session.*`
Next session of any type (Practice, Qualifying, Sprint, Race).

| State | Description |
|---|---|
| `session_name` | Session name (e.g. "Qualifying") |
| `session_type` | Session type |
| `circuit` / `country` / `location` | Venue |
| `date_start` | Start time (ISO 8601) |
| `countdown_days` | Days until session |
| `json` | Full object as JSON |

### `weekend_sessions.*`
| State | Description |
|---|---|
| `circuit` / `country` / `location` | Venue |
| `sessions_count` | Number of sessions this weekend |
| `next_session_index` | Index of the next session |
| `sessions_json` | All sessions as JSON array |

### `standings.*`
| State | Description |
|---|---|
| `drivers` | Driver standings — JSON array with position, points, name, team, colour |
| `teams` | Constructor standings — JSON array |
| `last_update` | Timestamp of last update |

### `live_session.*`
| State | Description |
|---|---|
| `status` | `no_session` / `active` / `finished` |
| `type` | Session name (e.g. "Race") |
| `track_status` | AllClear / Yellow / SafetyCar / Red / VSC |
| `laps_total` | Total laps in the race |
| `weather` | JSON: air_temperature, humidity, pressure, rainfall, track_temperature, wind_direction, wind_speed |

### `positions.*`
| State | Description |
|---|---|
| `current` | Sorted driver list with position, gap, interval, last/best lap |
| `intervals` | Gap to leader and interval per driver |
| `last_update` | Timestamp |

### `laps.*`
| State | Description |
|---|---|
| `current` | Latest lap times per driver |
| `fastest` | Top 10 fastest laps of the session |
| `last_update` | Timestamp |

### `pit_stops.*`
| State | Description |
|---|---|
| `latest` | Last 5 pit stops |
| `all` | All pit stops of the session |
| `last_update` | Timestamp |

### `tyres.*`
| State | Description |
|---|---|
| `stints` | All tyre stints per driver |
| `current` | Current compound per driver |
| `last_update` | Timestamp |

### `radio.*`
| State | Description |
|---|---|
| `latest` | Last 10 team radio messages (with audio URL) |
| `all` | All radio messages of the session |
| `last_update` | Timestamp |

### `race_control.*`
| State | Description |
|---|---|
| `latest_message` | Most recent race control message |
| `messages` | All messages as JSON array |

### `overtakes.*`
| State | Description |
|---|---|
| `all` | All detected overtakes (derived from position changes) |
| `last_update` | Timestamp |

### `meetings.*`
| State | Description |
|---|---|
| `current` | Current or most recent race weekend |
| `all` | All race weekends of the season |
| `last_update` | Timestamp |

### `session_result.*` / `starting_grid.*`
Results and grid from `SessionData` (populated at session end).

## Configuration

| Setting | Description | Default |
|---|---|---|
| `updateIntervalNormal` | How often calendar and standings are refreshed (seconds) | 3600 |
| `favoriteDriver` | Favourite driver name (for widget highlighting) | — |
| `favoriteTeam` | Favourite team name (for widget highlighting) | — |
| `highlightColor` | Highlight colour for favourites | #3bb273 |

The SignalR live connection is fully automatic — no polling configuration needed. The adapter connects 30 minutes before each session and disconnects 5 minutes after it ends.

## Requirements

- ioBroker ≥ 5.0.19 (js-controller ≥ 5.0.19)
- Node.js ≥ 20
- Internet connection

## License

MIT License — Copyright (c) 2026 Martin (bloop) <bloop16@hotmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Disclaimer

This project is **not affiliated** with, endorsed by, or in any way officially connected with Formula 1, the FIA, or any of their subsidiaries or affiliates.

**F1®**, **FORMULA ONE®**, **FORMULA 1®**, **FIA FORMULA ONE WORLD CHAMPIONSHIP®**, **GRAND PRIX®** and related marks are trademarks of Formula One Licensing B.V.

This adapter is intended for personal, non-commercial use only. Data is sourced from the [Jolpica/Ergast API](https://api.jolpi.ca) and the official [F1 Live Timing](https://livetiming.formula1.com) service.
