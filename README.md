# ioBroker.f1

[![NPM version](https://img.shields.io/npm/v/iobroker.f1.svg)](https://www.npmjs.com/package/iobroker.f1)
[![Downloads](https://img.shields.io/npm/dm/iobroker.f1.svg)](https://www.npmjs.com/package/iobroker.f1)
[![License](https://img.shields.io/github/license/bloop16/ioBroker.f1.svg)](https://github.com/bloop16/ioBroker.f1/blob/main/LICENSE)

Formula 1 live data integration for ioBroker using the [OpenF1 API](https://openf1.org/).

## Features

- **Race Calendar** - Next race information with countdown
- **Championship Standings** - Driver and team standings
- **Live Session Data** - Track status, weather, race control messages
- **Live Timing** - Positions, lap times, sector times, intervals
- **Pit Stops** - Pit stop data and statistics
- **Tyre Strategy** - Tyre compounds and stint information
- **Team Radio** - Radio messages with audio recordings
- **Telemetry** - Speed, throttle, brake, gear, RPM, DRS
- **Track Position** - Real-time car positions (X/Y/Z coordinates)

## VIS1 Widgets

### F1 Sessions

Session schedule for the current Grand Prix with live countdown. Colors, font sizes, timezone and language are configurable per widget instance in the VIS editor.

## Configuration

Configure the adapter in the ioBroker Admin interface:

- **Update Interval** - Normal polling interval in seconds (default: 3600)
- **Race Interval** - Fast polling during live sessions in seconds (default: 10)
- **Dynamic Polling** - Automatically switch to fast polling during sessions (default: enabled)

## Requirements

- ioBroker >= 5.0.19
- Node.js >= 20
- Internet connection

## Changelog

### 0.1.2 (2026-03-23)

- (bloop) Added VIS1 F1 Sessions widget with configurable colors, fonts and countdown
- (bloop) Dynamic widget scaling to any size in VIS editor
- (bloop) Countdown shows days, hours, minutes, seconds

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

This adapter is intended for personal, non-commercial use only. All data is provided by [OpenF1](https://openf1.org/), an independent community-driven API.
