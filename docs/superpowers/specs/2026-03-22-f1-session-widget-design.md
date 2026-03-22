# F1 Session Widget — VIS1 Design Spec

**Date:** 2026-03-22
**Project:** ioBroker.f1
**Scope:** First native VIS1 widget — Weekend Session Schedule (`f1-sessions`)

---

## Overview

Add a native VIS1 widget to the `iobroker.f1` adapter that displays the upcoming F1 race weekend session schedule. The widget reads directly from `f1.0.weekend_sessions.sessions_json`, renders itself in the VIS browser without any intermediate ioBroker states or external JavaScript adapter scripts, and supports per-instance style customisation via the VIS property editor.

The structure follows the pattern from the existing (now-removed) widgets in this repository, extended with configurable style properties. It is designed to grow: additional widgets are added as new subdirectories and extra EJS blocks in `f1.html`.

---

## Visual Style

**Bold F1** — dark background with a red gradient header, colour-coded session badge icons (FP cyan, Q yellow, Race red), alternating row backgrounds, and an optional countdown section. Matching the `f1_session_widget_v2.js` script output. All colours are applied inline so they respect the configurable property values.

Session status is indicated by:
- Left border accent (green = live, yellow = next)
- Status badge (Live / Nächste / Beendet / Geplant)
- Row background tint

---

## File Structure

Matches the existing project convention (each widget in its own folder, one combined `f1.html`):

```
widgets/
  f1.html                        ← VIS1 entry point (all EJS templates + script/link tags)
  f1-sessions/
    js/
      f1-sessions.js             ← Widget logic: init, render, subscription, countdown
    css/
      f1-sessions.css            ← Minimal CSS (only structural, not theme colours)
    img/
      prev_sessions.png          ← Preview thumbnail shown in VIS widget palette
```

Future widgets follow the same pattern: `f1-standings/`, `f1-timing/`, etc., each with their own subfolder and a new EJS block added to `f1.html`.

**Package changes required:**
- Create `widgets/` directory (removed in v0.1.1)
- `package.json` → add `"widgets/"` to the `files` array
- `io-package.json` → add `"restartAdapters": ["vis"]` to `common`

---

## VIS1 Entry Point (`widgets/f1.html`)

`f1.html` is the single file VIS1 discovers (by scanning `iobroker.vis/www/widgets/*.html`). It loads per-widget assets and contains one EJS template block per widget:

```html
<!-- f1-sessions widget -->
<script type="text/javascript" src="widgets/f1-sessions/js/f1-sessions.js"></script>
<link rel="stylesheet" href="widgets/f1-sessions/css/f1-sessions.css">

<script id="tplF1Sessions"
        type="text/ejs"
        class="vis-tpl"
        data-vis-set="f1"
        data-vis-type="static"
        data-vis-name="F1 Sessions"
        data-vis-prev='<div style="...">[mini preview HTML]</div>'
        data-vis-attrs="oid;color_accent[#e10600]/color;color_bg[#15151f]/color;color_card[#1a1a28]/color;color_text[#eeeeef]/color;color_text_muted[#666678]/color;font_size_header[22px];font_size_session[13px];font_size_time[16px];timezone[Europe/Vienna];language[de];show_countdown[true]/checkbox">
  <div class="vis-widget <%== this.data.attr('class') %>"
       id="<%= this.data.attr('wid') %>"
       style="width:440px;height:600px;overflow:hidden;"
       <%= (el) -> vis.binds["f1"].createSessionsWidget(el, view, data, style) %>>
    <div style="padding:20px;text-align:center;color:#666;">Loading...</div>
  </div>
</script>
```

Key points:
- The `<%= (el) -> ... %>` expression is a **CanJS EJS element callback** — it is placed as an attribute on the widget div, not inside the body. VIS1 calls the function with the live DOM element once it is in the document.
- `data-vis-attrs` is a semicolon-separated list of property names. `[defaultValue]` sets the default, `/color` marks a colour picker, `/checkbox` marks a boolean toggle. Plain entries are text inputs. These values are editable per widget instance in the VIS property editor.
- `this.data.attr('wid')` and `this.data.attr('class')` are standard VIS1 template variables for widget ID and CSS class.
- Width/height in `style` set the default VIS drag-drop size; the user can resize freely in the editor.

---

## Widget Binding (`f1-sessions.js`)

```js
// Extend vis.binds["f1"] if already initialised by another widget file,
// or create it fresh if this is the first widget loaded.
vis.binds["f1"] = vis.binds["f1"] || {};

vis.binds["f1"].createSessionsWidget = function(el, view, data, style) {
    var $div = $(el);
    var widgetID = el.id;

    // Read configurable properties (data.attr returns user value or [default])
    var props = {
        oid:              data.attr("oid") || "f1.0.weekend_sessions.sessions_json",
        color_accent:     data.attr("color_accent")     || "#e10600",
        color_bg:         data.attr("color_bg")         || "#15151f",
        color_card:       data.attr("color_card")       || "#1a1a28",
        color_text:       data.attr("color_text")       || "#eeeeef",
        color_text_muted: data.attr("color_text_muted") || "#666678",
        font_size_header: data.attr("font_size_header") || "22px",
        font_size_session:data.attr("font_size_session")|| "13px",
        font_size_time:   data.attr("font_size_time")   || "16px",
        timezone:         data.attr("timezone")          || "Europe/Vienna",
        language:         data.attr("language")          || "de",
        show_countdown:   data.attr("show_countdown") !== "false"
    };
    var oid = props.oid;

    function applyData(jsonVal) {
        var sessions;
        try {
            sessions = typeof jsonVal === "object" ? jsonVal : JSON.parse(jsonVal);
        } catch(e) {
            $div.html('<div style="...">Ungültige Daten</div>');
            console.warn("f1-sessions: parse error", e);
            return;
        }
        $div.html(vis.binds["f1"].renderSessions(sessions, props, widgetID));
        vis.binds["f1"].startCountdown(widgetID, sessions, props);
    }

    // Initial value
    vis.conn.getStates(oid, function(err, states) {
        if (!err && states && states[oid] && states[oid].val) {
            applyData(states[oid].val);
        } else {
            $div.html('<div style="...">Warte auf F1-Daten…</div>');
        }
    });

    // Live updates — guard with element-exists check to handle widget removal
    vis.conn.subscribe([oid]);
    vis.conn._socket.on("stateChange", function(id, state) {
        if (id === oid && $("#" + widgetID).length) {
            applyData(state ? state.val : null);
        }
    });
};
```

---

## Rendering (`renderSessions`)

`vis.binds["f1"].renderSessions(sessions, props, widgetID)` returns an HTML string built in sections:

1. **Wrapper** — `width:100%; height:100%; overflow:auto; background: props.color_bg`
2. **Header** — red gradient using `props.color_accent`; flag emoji + GP name at `props.font_size_header`; year; LIVE or KOMMEND badge
3. **Info bar** — circuit name, date range, session count, timezone label
4. **Section divider** — "Session-Zeitplan" / "Session Schedule" (depending on `props.language`)
5. **Session rows** — one per session: badge icon (colour per session type), session name at `props.font_size_session`, date/time, time at `props.font_size_time`, status tag; live/next rows get left border + background tint
6. **Countdown section** *(skipped if `props.show_countdown === false`)* — countdown label + three `<span>` elements with IDs `widgetID + "-cd-h"`, `widgetID + "-cd-m"`, `widgetID + "-cd-s"` for patching

Header values are extracted from `sessions[0]`:
- Flag: `FLAGS[sessions[0].country_code]`
- GP name: `GP_NAMES[sessions[0].country_name]` or `sessions[0].country_name + " GP"`
- Circuit: `sessions[0].circuit_short_name`
- Year: `sessions[0].year`

---

## Countdown

`vis.binds["f1"].startCountdown(widgetID, sessions, props)`:
- Finds the next or live session
- Sets a `setInterval` (1 second)
- Each tick: computes `{ hours, minutes, seconds }` from the remaining time and patches the three named spans directly — no full re-render
- On each tick, checks `if (!$("#" + widgetID).length)` and calls `clearInterval` if the widget has been removed from the DOM

---

## Data Shape

`sessions_json` is a JSON-encoded array. Each element:

```
session_key, session_type, session_name,
date_start, date_end,
circuit_short_name, country_name, country_code,
location, year, meeting_key, circuit_key, country_key, gmt_offset
```

---

## Shared Utilities (inline in `f1-sessions.js`)

Private helper functions (not exposed to `vis.binds["f1"]` — only one widget needs them):

- `FLAGS` — country code → flag emoji
- `GP_NAMES` — country name → GP display name
- `fmtTime(dateStr, tz)` — HH:MM in the configured timezone
- `fmtDateShort(dateStr, tz)` — DD.MM
- `fmtDateLong(dateStr, tz)` — "Fr 27. Mär"
- `sessionStatus(session)` — `'live' | 'upcoming' | 'completed'`
- `sessionIcon(session)` — `'FP1' | 'Q' | 'R' | 'SPR'` etc.
- `iconColors(session)` — `{ bg, color, border }` for the badge
- `pad2(n)` — zero-pad to 2 digits
- `i18n(key, lang)` — label strings in de/en

When a second widget needs any of these, they are promoted to the shared `vis.binds["f1"]` namespace at that point (YAGNI).

---

## Error States

| Condition | Output |
|---|---|
| `oid` empty | `"Kein OID konfiguriert"` placeholder div |
| State null/empty | `"Warte auf F1-Daten…"` placeholder div |
| JSON parse error | `"Ungültige Daten"` placeholder div; `console.warn(...)` |

---

## Scope

**In scope:**
- `f1-sessions` widget (Weekend Session Schedule)
- `widgets/f1.html` structured to accept additional widgets without refactoring
- `package.json` and `io-package.json` changes to distribute the widget

**Out of scope:**
- Additional widgets (standings, timing, etc.) — future iterations
- VIS2 compatibility
- Localisation beyond de/en

---

## Success Criteria

- Widget appears in VIS1 widget palette under group "F1"
- Setting the OID renders the session schedule with correct data
- All style properties are editable in the VIS property panel
- Countdown updates every second in the browser without re-fetching data
- Multiple widget instances on the same view work independently (ID-namespaced spans)
- No ioBroker JavaScript adapter script required
