# ioBroker.f1

[![NPM version](https://img.shields.io/npm/v/iobroker.f1.svg)](https://www.npmjs.com/package/iobroker.f1)
[![Downloads](https://img.shields.io/npm/dm/iobroker.f1.svg)](https://www.npmjs.com/package/iobroker.f1)
[![License](https://img.shields.io/github/license/bloop16/ioBroker.f1.svg)](https://github.com/bloop16/ioBroker.f1/blob/main/LICENSE)

## Formula 1 Live Data Integration for ioBroker

Brings Formula 1 race information, live session data, and championship standings into your ioBroker installation.

### Features (MVP - Phase 1)

- ✅ **Next Race Information**
  - Circuit name and location
  - Race date and countdown
  - Country information
  
- ✅ **Auto-Update**
  - Configurable update interval
  - Connection status monitoring

### Planned Features

- **Phase 2:** Live Session Tracking
  - Track status (green/yellow/red/SC)
  - Weather conditions
  - Race Control messages
  
- **Phase 3:** Advanced Timing
  - Lap times and sectors
  - Tyre strategy
  - Pit stop information
  
- **Phase 4:** VIS Widgets
  - Custom widgets for VIS1 and VIS2
  - Interactive dashboards

### Data Source

This adapter uses the [OpenF1 API](https://openf1.org/) for all Formula 1 data.

### Installation

#### Via npm (when published)
```bash
npm install iobroker.f1
```

#### From GitHub (development)
```bash
cd /opt/iobroker
npm install bloop16/ioBroker.f1
```

### Configuration

- **Update Interval:** How often to fetch new data (in seconds, default: 60)
- **Favorite Driver:** Your favorite driver (for future highlighting)
- **Favorite Team:** Your favorite team (for future highlighting)
- **Highlight Color:** Color for highlighting favorites (hex code)

### States

#### next_race.*
- `next_race.circuit` - Circuit name (e.g., "Melbourne")
- `next_race.country` - Country name (e.g., "Australia")
- `next_race.location` - Location (e.g., "Melbourne")
- `next_race.date_start` - Race start date/time (ISO 8601)
- `next_race.countdown_days` - Days until race
- `next_race.json` - Full race information as JSON

### Requirements

- ioBroker >= 5.0.19
- Node.js >= 20
- Internet connection

### License

MIT License

Copyright (c) 2026 Martin (bloop) <git@bloopnet.de>

### Disclaimer

This project is not affiliated with, endorsed by, or in any way officially connected with Formula 1, the FIA, or any of their subsidiaries or affiliates.

F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX and related marks are trade marks of Formula One Licensing B.V.

### Changelog

#### 0.1.0 (2026-03-10)
- Initial MVP release
- Next race information
- OpenF1 API integration
- Auto-update functionality

## Development & Testing

### Local Testing (without ioBroker installation)



### Test Scripts

- **test-local.js** - Mock adapter with real API calls
- **test-api-v2.js** - Direct API testing

### Example Output

```
🏎️  F1 Adapter Local Test
Circuit: Shanghai
Country: China
Date: 2026-03-15T07:00:00+00:00
Days until race: 5
✅ TEST SUCCESSFUL!
```

---

## ⚖️ Legal Disclaimer

This adapter is an **unofficial, community-operated project** for educational and non-commercial use.

### Not Affiliated With

This project is **NOT** associated, affiliated, endorsed, or sponsored by:
- Formula One World Championship Limited
- Formula One Management
- Formula One Licensing B.V.
- FIA (Fédération Internationale de l'Automobile)

### Trademarks

The marks **F1®**, **FORMULA ONE®**, **FORMULA 1®**, **FIA FORMULA ONE WORLD CHAMPIONSHIP®**, **GRAND PRIX®** and related marks are trademarks of Formula One Licensing B.V.

### Data Source

All data is provided by [OpenF1](https://openf1.org/), an **open-source API** aggregating publicly available Formula 1 timing and telemetry data.

OpenF1 is an independent, community-driven project not associated with Formula 1, FIA, or Formula One Management.

### Intended Use

This adapter is intended for:
- ✅ Personal use
- ✅ Educational purposes
- ✅ Non-commercial fan engagement
- ✅ Research and learning

### Commercial Use

❌ **NOT for commercial use** without appropriate licensing from Formula One Licensing B.V.

For commercial use cases, please contact Formula One Management for licensing information.

### Data Rights

This project does not claim ownership of Formula 1 data, trademarks, broadcasts, or any official Formula 1 content. All data is accessed through public APIs and is subject to the terms and conditions of those services.

---

## 📜 License

MIT License - See [LICENSE](LICENSE) file for details.

**Note:** The MIT license applies to the adapter code only, not to Formula 1 data, trademarks, or content.
