# F1 Sessions Widget — VIS2 Design Spec

**Date:** 2026-03-24
**Project:** ioBroker.f1
**Scope:** VIS2 native React widget — Weekend Session Schedule (`f1-sessions`)

---

## Overview

Add a native VIS2 widget to the `iobroker.f1` adapter that displays the same F1 race weekend session schedule as the existing VIS1 widget. The widget is visually identical to VIS1 (`widgets/f1-sessions/`) but built as a React component using the official ioBroker VIS2 widget framework. VIS1 code is not modified.

The widget reads from `f1.0.weekend_sessions.sessions_json`, renders in the VIS2 browser, and supports the same per-instance style properties as VIS1 via the VIS2 property editor.

---

## Visual Style

Identical to the VIS1 widget:
- Dark background with red gradient header
- Colour-coded session badge icons (FP cyan, Q yellow, Race red, Sprint orange)
- Alternating row backgrounds
- Live/Next status indicators (left border + badge)
- Optional countdown section (d/h/m/s)

All colours are applied inline via configurable props — no hardcoded theme values.

---

## File Structure

```
iobroker.f1/
├── widgets/                           ← VIS1 (unchanged)
│   ├── f1.html
│   └── f1-sessions/
│       ├── js/f1-sessions.js
│       └── css/f1-sessions.css
│
├── src-widgets-ts/                    ← NEW: VIS2 source (TypeScript + Vite)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── index.tsx                  ← registers all VIS2 widgets
│       └── components/
│           ├── F1Sessions.tsx         ← React widget component
│           └── F1Sessions.css         ← structural CSS only
│
└── widgets/f1/                        ← NEW: VIS2 build output (committed)
    └── customWidgets.js
```

**Root `package.json`:** Add `"widgets/f1/"` to the `files` array.

---

## VIS2 Registration (`io-package.json`)

Add to `common`:

```json
"visWidgets": {
  "f1Sessions": {
    "i18n": "component",
    "url": "f1/customWidgets.js",
    "bundlerType": "module",
    "components": ["F1Sessions"]
  }
},
"restartAdapters": ["vis-2"]
```

- `"bundlerType": "module"` — required for Vite/TypeScript builds
- `"i18n": "component"` — translations are handled inside the component
- `"components"` — lists the exported class name from `customWidgets.js`

---

## Build Pipeline (`src-widgets-ts/`)

**Stack:** TypeScript + Vite + React 18 + `@iobroker/vis-2-widgets-react-dev`

**`src-widgets-ts/package.json` scripts:**
```json
{
  "scripts": {
    "build": "vite build",
    "watch": "vite build --watch",
    "dev-server": "dev-server watch --noStart"
  },
  "dependencies": {
    "@iobroker/vis-2-widgets-react-dev": "^4.x",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "vite": "^5",
    "typescript": "^5",
    "@types/react": "^18"
  }
}
```

**Vite output target:** `../widgets/f1/customWidgets.js`

**Root `package.json`** gets a convenience script:
```json
"build:widgets": "cd src-widgets-ts && npm run build"
```

---

## Component Architecture (`F1Sessions.tsx`)

```
class F1Sessions extends VisRxWidget<F1SessionsRxData, F1SessionsState>
  ├── static getWidgetInfo()         ← widget metadata + attribute definitions
  ├── renderWidgetBody()             ← main render entry point
  │     ├── renderHeader()           ← flag, GP name, year, LIVE badge
  │     ├── renderInfoBar()          ← circuit, date range, session count, timezone
  │     ├── renderSessionList()      ← maps sessions → renderSessionRow()
  │     ├── renderSessionRow(s)      ← badge icon, name, date/time, status tag
  │     └── renderCountdown()        ← d/h/m/s countdown (conditional)
  └── componentDidUpdate / useEffect ← setInterval countdown, cleaned up on unmount
```

### Widget Attributes (`getWidgetInfo`)

Same attributes as VIS1, defined as `visAttrs` fields:

| Name               | Type     | Default         |
|--------------------|----------|-----------------|
| `oid`              | `id`     | `f1.0.weekend_sessions.sessions_json` |
| `color_accent`     | `color`  | `#e10600`       |
| `color_bg`         | `color`  | `#15151f`       |
| `color_card`       | `color`  | `#1a1a28`       |
| `color_text`       | `color`  | `#eeeeef`       |
| `color_text_muted` | `color`  | `#666678`       |
| `font_size_header` | `text`   | `22px`          |
| `font_size_session`| `text`   | `13px`          |
| `font_size_time`   | `text`   | `16px`          |
| `font_size_countdown` | `text` | `24px`         |
| `timezone`         | `text`   | `Europe/Vienna` |
| `language`         | `select` | `de` (de/en)    |
| `show_countdown`   | `checkbox`| `true`         |

### State Subscription

`VisRxWidget` automatically subscribes to the state ID bound to `oid` and provides updates via `this.state.values[oid]`. No manual `subscribe()` / `stateChange` listener needed.

### Countdown

Implemented via `componentDidUpdate` + `setInterval` (1 second). The interval is stored in an instance variable and cleared in `componentWillUnmount`. Countdown targets the live session's end time (if live) or next session's start time (if upcoming). Updates only the countdown DOM elements — no full re-render.

---

## Internal Helpers (TypeScript, private to component)

Identical logic to VIS1, written in TypeScript:

| Helper | Description |
|--------|-------------|
| `FLAGS` | country code → flag emoji |
| `GP_NAMES` | country name → GP display name |
| `sessionStatus(s)` | `'live' \| 'upcoming' \| 'completed'` |
| `sessionIcon(s)` | `'FP1' \| 'Q' \| 'R' \| 'SPR'` etc. |
| `iconColors(s)` | `{ bg, color, border }` for badge |
| `fmtTime(dateStr, tz, lang)` | HH:MM in configured timezone |
| `fmtDateShort(dateStr, tz, lang)` | DD.MM |
| `fmtDateLong(dateStr, tz, lang)` | "Fr 27. Mär" |
| `pad2(n)` | zero-pad to 2 digits |
| `i18n(key, lang)` | de/en labels |

---

## Data Shape

Same as VIS1. `sessions_json` is a JSON-encoded array. Each element:

```
session_key, session_type, session_name,
date_start, date_end,
circuit_short_name, country_name, country_code,
location, year, meeting_key, circuit_key, country_key, gmt_offset
```

---

## Error States

| Condition | Output |
|---|---|
| State null/empty | Placeholder: "Warte auf F1-Daten…" / "Waiting for F1 data…" |
| JSON parse error | Placeholder: "Ungültige Daten" / "Invalid data" + `console.warn` |

---

## Scope

**In scope:**
- `F1Sessions` VIS2 widget (Weekend Session Schedule)
- `src-widgets-ts/` TypeScript + Vite build setup
- `io-package.json` and root `package.json` changes

**Out of scope:**
- VIS1 changes (none permitted)
- Additional widgets (standings, timing, etc.)
- Localisation beyond de/en

---

## Success Criteria

- Widget appears in VIS2 widget palette under group "F1"
- Visually identical to the VIS1 widget
- All style properties editable in the VIS2 property panel
- OID change in editor updates the displayed data live
- Countdown updates every second without full re-render
- Multiple instances on the same view work independently
- VIS1 widget unaffected
