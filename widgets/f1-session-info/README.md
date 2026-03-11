# F1 Session Info Widget

VIS1 widget for displaying live Formula 1 session information, weather, and race control messages.

## Features

- Session type (Practice, Qualifying, Sprint, Race)
- Session status (Active, Finished, Pre-Session, No Session)
- Track status with flag colors (Green, Yellow, Red, Blue, White)
- Weather data (air/track temperature, wind, humidity)
- Latest race control message
- Dark F1-styled theme
- Responsive layout

## Data Sources

Requires these ioBroker states:

- `f1.0.live_session.json` - Complete session data (JSON)
- `f1.0.race_control.latest_message` - Latest message (string)

Expected JSON structure:
```json
{
  "session_type": "Race",
  "status": "active",
  "track_status": "AllClear",
  "weather": {
    "air_temperature": 28,
    "track_temperature": 42,
    "wind_speed": 12,
    "wind_direction": "NE",
    "humidity": 65
  }
}
```

## Installation

1. Copy widget files to VIS:
   ```
   /opt/iobroker/iobroker-data/files/vis.0/widgets/f1-session-info/
   ```

2. Add widget to VIS view via widget selector (F1 widget set)

3. Widget auto-subscribes to required states

## Session Types

- 🏁 Practice
- ⏱️ Qualifying
- ⚡ Sprint
- 🏆 Race

## Track Status Flags

- 🟢 Green Flag (All Clear)
- 🟡 Yellow Flag (Caution / Safety Car / VSC)
- 🔴 Red Flag (Session Stopped)
- 🔵 Blue Flag (Lapping)
- ⚪ White Flag (Slow Vehicle)

## Status Colors

- **Active**: Green badge
- **Finished**: Gray badge
- **Pre-Session**: Yellow badge
- **No Session**: Red badge

## Weather Display

- 🌡️ Air Temperature (°C)
- 🏁 Track Temperature (°C)
- 💨 Wind (speed + direction)
- 💧 Humidity (%)

## Customization

Edit `css/f1-session-info.css` to customize:

- Background: `#1a1a1a`
- Header: `#242424`
- Accent: `#9D4EDD` (purple)
- Flag colors: Green (#10b981), Yellow (#fbbf24), Red (#ef4444)

## Version

0.1.0 - Initial release
