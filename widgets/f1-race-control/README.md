# F1 Race Control Card

VIS1 widget for displaying race control messages and flags.

## Features

- Real-time race control messages
- Flag detection (Green, Yellow, Red, Blue, White, Black, Chequered)
- Color-coded borders
- Message timestamps
- Newest message highlighted
- Auto-scroll
- Dark theme

## Data Sources

- `f1.0.race_control.messages` - JSON array

Expected structure:
```json
[
  {
    "date": "2026-03-15T14:32:45Z",
    "message": "SAFETY CAR DEPLOYED"
  }
]
```

## Flag Detection

- 🟢 Green Flag (All Clear)
- 🟡 Yellow Flag (Safety Car, VSC, Caution)
- 🔴 Red Flag (Session Stopped)
- 🔵 Blue Flag (Lapping)
- ⚪ White Flag (Slow Vehicle)
- ⚫ Black Flag (Disqualification)
- 🏁 Chequered Flag (Race End)
- 📻 Default (Generic Message)

## Version

0.1.0 - Initial release
