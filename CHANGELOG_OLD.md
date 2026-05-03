# Older Changelog Entries

<!--
    Older changelog entries are stored here.
    This file is supported by @alcalzone/releasescript.
-->

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
