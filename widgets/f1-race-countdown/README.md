# F1 Race Countdown Widget

VIS1 widget for displaying the next Formula 1 race countdown.

## Features

- Next race circuit name
- Country and location
- Days until race countdown
- Race date and time (UTC)
- Dark F1-styled theme
- Purple accent color
- Responsive design

## Data Sources

Requires these ioBroker states:

- `f1.0.next_race.circuit` - Circuit short name
- `f1.0.next_race.country` - Country name
- `f1.0.next_race.location` - City/location
- `f1.0.next_race.date_start` - ISO 8601 timestamp
- `f1.0.next_race.countdown_days` - Days until race (number)

## Preview

Open `preview.html` in a browser to see the widget design.

## Customization

Edit `css/f1-race-countdown.css` to customize colors and layout:

- Background: `#1a1a1a`
- Header: `#242424`
- Accent color: `#9D4EDD` (purple)
- Text: `#ffffff`

