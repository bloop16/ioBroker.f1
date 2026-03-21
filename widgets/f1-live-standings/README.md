# F1 Live Standings Widget

VIS1 widget for displaying real-time Formula 1 race positions.

## Features

- Real-time driver positions (P1-P20)
- Team color bars
- Gap to leader
- Last lap times
- Fastest lap highlighting (purple)
- Scrollable list
- Dark F1-styled theme

## Data Sources

Requires these ioBroker states:

- `f1.0.positions.current` - JSON array with position data

Expected JSON structure:

```json
[
  {
    "position": 1,
    "driver_number": 1,
    "name_acronym": "VER",
    "full_name": "Max Verstappen",
    "gap_to_leader": "0.000",
    "laptime": "1:32.123"
  },
  ...
]
```

## Installation

1. Copy widget files to VIS:

    ```
    /opt/iobroker/iobroker-data/files/vis.0/widgets/f1-live-standings/
    ```

2. Add widget to VIS view via widget selector (F1 widget set)

3. Widget auto-subscribes to `f1.0.positions.current`

## Customization

Edit `css/f1-live-standings.css` to customize:

- Background: `#1a1a1a`
- Header: `#242424`
- Fastest lap: `#9D4EDD` (purple)
- Team colors: Defined in JS (teamColors object)

## Team Colors

Default colors (can be customized in JS):

- Red Bull: #6692FF (blue)
- Ferrari: #DC0000 (red)
- Mercedes: #00D2BE (cyan)
- McLaren: #FF8700 (orange)
- Aston Martin: #006F62 (green)
- Alpine: #0090FF (blue)
- Williams: #2B4562 (dark blue)
- Haas: #B6BABD (gray)
- AlphaTauri: #1E41FF (blue)
- Alfa Romeo: #900000 (dark red)

## Version

0.1.0 - Initial release
