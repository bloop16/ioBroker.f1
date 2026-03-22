# F1 Session Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native VIS1 widget `f1-sessions` to the ioBroker F1 adapter that renders the weekend session schedule directly from `f1.0.weekend_sessions.sessions_json` with fully configurable styling per widget instance.

**Architecture:** A single `widgets/f1.html` entry point loads per-widget JS/CSS and contains EJS template blocks for each widget type. The `f1-sessions` widget registers `vis.binds["f1"].createSessionsWidget`, subscribes to the configured OID, and renders inline-styled HTML into its container. Pure helper functions are tested with Node.js; VIS-dependent code is verified manually in the dev-server.

**Tech Stack:** Vanilla JS (ES5, no bundler), jQuery (provided by VIS1), CanJS EJS templating (provided by VIS1), ioBroker VIS1

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `widgets/f1.html` | VIS1 entry point — loads assets, contains EJS template |
| Create | `widgets/f1-sessions/js/f1-sessions.js` | All widget logic: helpers, render, subscription, countdown |
| Create | `widgets/f1-sessions/css/f1-sessions.css` | Structural CSS only (sizing, overflow) |
| Create | `test/widgets/f1-sessions.test.js` | Node.js unit tests for pure helper functions |
| Modify | `package.json` | Add `"widgets/"` to `files`, add `test:widgets` script |
| Modify | `io-package.json` | Add `"restartAdapters": ["vis"]` to `common` |

---

## Task 1: Package Infrastructure

**Files:**
- Modify: `package.json`
- Modify: `io-package.json`
- Create dirs: `widgets/f1-sessions/js/`, `widgets/f1-sessions/css/`

- [ ] **Step 1.1: Create widget directory structure**

```bash
mkdir -p widgets/f1-sessions/js
mkdir -p widgets/f1-sessions/css
mkdir -p test/widgets
```

- [ ] **Step 1.2: Update `package.json` — files array and test:widgets script**

In `package.json`, change the `files` array from:
```json
"files": [
    "admin/",
    "build/",
    "io-package.json",
    "LICENSE"
]
```
to:
```json
"files": [
    "admin/",
    "build/",
    "widgets/",
    "io-package.json",
    "LICENSE"
]
```

Also add a `test:widgets` script to the `scripts` block:
```json
"test:widgets": "mocha test/widgets --exit"
```

- [ ] **Step 1.3: Add `restartAdapters` to io-package.json**

In `io-package.json`, inside the `"common"` object, add after the `"tier"` field:
```json
"restartAdapters": ["vis"]
```

- [ ] **Step 1.4: Verify JSON is valid**

```bash
node -e "require('./package.json'); console.log('package.json OK')"
node -e "require('./io-package.json'); console.log('io-package.json OK')"
```

Expected: both print OK with no errors.

- [ ] **Step 1.5: Commit**

```bash
git add package.json io-package.json
git commit -m "chore: add widgets/ to package files and restartAdapters to io-package"
```

---

## Task 2: CSS Skeleton

**Files:**
- Create: `widgets/f1-sessions/css/f1-sessions.css`

- [ ] **Step 2.1: Create structural CSS**

Create `widgets/f1-sessions/css/f1-sessions.css` with:

```css
/* F1 Sessions Widget — structural rules only.
   Theme colours are applied inline via widget properties. */

.f1-sessions-widget {
    width: 100%;
    height: 100%;
    overflow: auto;
    box-sizing: border-box;
    font-family: 'Segoe UI', Tahoma, sans-serif;
}

.f1-sessions-widget * {
    box-sizing: border-box;
}
```

- [ ] **Step 2.2: Commit**

```bash
git add widgets/f1-sessions/css/f1-sessions.css
git commit -m "feat: add f1-sessions widget CSS skeleton"
```

---

## Task 3: Helper Functions + Unit Tests

**Files:**
- Create: `widgets/f1-sessions/js/f1-sessions.js` (helpers section only)
- Create: `test/widgets/f1-sessions.test.js`

These are pure functions with no DOM or VIS dependency — fully unit-testable in Node.js.

- [ ] **Step 3.1: Write the failing tests first**

Create `test/widgets/f1-sessions.test.js`:

```js
"use strict";

// Load helpers by evaluating the module in a stub environment
// (avoids need for vis/jQuery globals for pure functions)
const fs = require("fs");
const path = require("path");
const assert = require("assert");

// Stub the VIS globals so the file can be required in Node
global.vis = { binds: {} };
global.$ = function() { return { html: function(){}, length: 1 }; };

// Eval the widget file — after this, helpers are in scope via the closure.
// We expose them by temporarily assigning to a test namespace inside the file.
// (See Step 3.2 for how f1-sessions.js exports them under _test.)
const widgetSrc = fs.readFileSync(
    path.join(__dirname, "../../widgets/f1-sessions/js/f1-sessions.js"),
    "utf8"
);
eval(widgetSrc); // eslint-disable-line no-eval
const h = vis.binds["f1"]._test; // test-only export

describe("f1-sessions helpers", function() {

    // ── sessionStatus ──────────────────────────────────────────────────────
    describe("sessionStatus", function() {
        it("returns 'live' when now is between start and end", function() {
            var now = new Date();
            var s = {
                date_start: new Date(now - 10000).toISOString(),
                date_end:   new Date(now + 10000).toISOString()
            };
            assert.strictEqual(h.sessionStatus(s), "live");
        });

        it("returns 'upcoming' when session is in the future", function() {
            var s = {
                date_start: new Date(Date.now() + 3600000).toISOString(),
                date_end:   new Date(Date.now() + 7200000).toISOString()
            };
            assert.strictEqual(h.sessionStatus(s), "upcoming");
        });

        it("returns 'completed' when session has ended", function() {
            var s = {
                date_start: new Date(Date.now() - 7200000).toISOString(),
                date_end:   new Date(Date.now() - 3600000).toISOString()
            };
            assert.strictEqual(h.sessionStatus(s), "completed");
        });
    });

    // ── sessionIcon ────────────────────────────────────────────────────────
    describe("sessionIcon", function() {
        it("returns FP1 for Practice 1", function() {
            assert.strictEqual(h.sessionIcon({ session_type: "Practice", session_name: "Practice 1" }), "FP1");
        });
        it("returns FP3 for Practice 3", function() {
            assert.strictEqual(h.sessionIcon({ session_type: "Practice", session_name: "Practice 3" }), "FP3");
        });
        it("returns Q for Qualifying", function() {
            assert.strictEqual(h.sessionIcon({ session_type: "Qualifying", session_name: "Qualifying" }), "Q");
        });
        it("returns R for Race", function() {
            assert.strictEqual(h.sessionIcon({ session_type: "Race", session_name: "Race" }), "R");
        });
        it("returns SPR for Sprint", function() {
            assert.strictEqual(h.sessionIcon({ session_type: "Sprint", session_name: "Sprint" }), "SPR");
        });
    });

    // ── pad2 ───────────────────────────────────────────────────────────────
    describe("pad2", function() {
        it("pads single digits", function() {
            assert.strictEqual(h.pad2(5), "05");
        });
        it("does not pad two-digit numbers", function() {
            assert.strictEqual(h.pad2(42), "42");
        });
    });

    // ── i18n ───────────────────────────────────────────────────────────────
    describe("i18n", function() {
        it("returns German label for 'de'", function() {
            assert.strictEqual(h.i18n("schedule", "de"), "Session-Zeitplan");
        });
        it("returns English label for 'en'", function() {
            assert.strictEqual(h.i18n("schedule", "en"), "Session Schedule");
        });
        it("falls back to English for unknown lang", function() {
            assert.strictEqual(h.i18n("schedule", "fr"), "Session Schedule");
        });
    });

    // ── FLAGS / GP_NAMES ───────────────────────────────────────────────────
    describe("FLAGS", function() {
        it("has JPN flag", function() {
            assert.strictEqual(h.FLAGS["JPN"], "🇯🇵");
        });
    });

    describe("GP_NAMES", function() {
        it("maps Japan to Japanese GP", function() {
            assert.strictEqual(h.GP_NAMES["Japan"], "Japanese GP");
        });
    });
});
```

- [ ] **Step 3.2: Run tests — expect FAIL (file doesn't exist yet)**

```bash
npm run test:widgets 2>&1 | head -30
```

Expected: Error — `f1-sessions.js` not found or `vis.binds["f1"]._test` undefined.

- [ ] **Step 3.3: Create `f1-sessions.js` with helpers only**

Create `widgets/f1-sessions/js/f1-sessions.js`:

```js
/*
    ioBroker.f1 — Session Schedule Widget
    VIS1 Widget Implementation
*/

/* global $, vis */

(function () {
    "use strict";

    // ── Lookup tables ───────────────────────────────────────────────────────
    var FLAGS = {
        JPN: "🇯🇵", AUS: "🇦🇺", BHR: "🇧🇭", SAU: "🇸🇦", USA: "🇺🇸",
        ITA: "🇮🇹", MCO: "🇲🇨", ESP: "🇪🇸", CAN: "🇨🇦", AUT: "🇦🇹",
        GBR: "🇬🇧", HUN: "🇭🇺", BEL: "🇧🇪", NLD: "🇳🇱", SGP: "🇸🇬",
        AZE: "🇦🇿", MEX: "🇲🇽", BRA: "🇧🇷", QAT: "🇶🇦", ARE: "🇦🇪",
        CHN: "🇨🇳", POR: "🇵🇹"
    };

    var GP_NAMES = {
        "Japan": "Japanese GP",       "Australia": "Australian GP",
        "Bahrain": "Bahrain GP",      "Saudi Arabia": "Saudi Arabian GP",
        "United States": "United States GP", "Italy": "Italian GP",
        "Monaco": "Monaco GP",        "Spain": "Spanish GP",
        "Canada": "Canadian GP",      "Austria": "Austrian GP",
        "Great Britain": "British GP", "Hungary": "Hungarian GP",
        "Belgium": "Belgian GP",      "Netherlands": "Dutch GP",
        "Singapore": "Singapore GP",  "Azerbaijan": "Azerbaijan GP",
        "Mexico": "Mexican GP",       "Brazil": "Brazilian GP",
        "Qatar": "Qatar GP",          "Abu Dhabi": "Abu Dhabi GP",
        "China": "Chinese GP",        "Portugal": "Portuguese GP"
    };

    var I18N = {
        schedule:  { de: "Session-Zeitplan",  en: "Session Schedule" },
        timeIn:    { de: "Zeiten in",         en: "Times in" },
        sessions:  { de: "Sessions",          en: "Sessions" },
        circuit:   { de: "Strecke",           en: "Circuit" },
        date:      { de: "Datum",             en: "Date" },
        live:      { de: "Live",              en: "Live" },
        next:      { de: "Nächste",           en: "Next" },
        done:      { de: "Beendet",           en: "Done" },
        planned:   { de: "Geplant",           en: "Planned" },
        upcoming:  { de: "KOMMEND",           en: "UPCOMING" },
        noOid:     { de: "Kein OID konfiguriert", en: "No OID configured" },
        waiting:   { de: "Warte auf F1-Daten…",   en: "Waiting for F1 data…" },
        invalid:   { de: "Ungültige Daten",        en: "Invalid data" }
    };

    // ── Pure helpers ────────────────────────────────────────────────────────
    function pad2(n) {
        return String(n).padStart(2, "0");
    }

    function i18n(key, lang) {
        var row = I18N[key];
        if (!row) return key;
        return row[lang] || row["en"];
    }

    function fmtTime(dateStr, tz) {
        return new Date(dateStr).toLocaleTimeString("de-AT", {
            hour: "2-digit", minute: "2-digit", timeZone: tz
        });
    }

    function fmtDateShort(dateStr, tz) {
        return new Date(dateStr).toLocaleDateString("de-AT", {
            day: "2-digit", month: "2-digit", timeZone: tz
        });
    }

    function fmtDateLong(dateStr, tz) {
        return new Date(dateStr).toLocaleDateString("de-AT", {
            weekday: "short", day: "2-digit", month: "short", timeZone: tz
        });
    }

    function sessionStatus(s) {
        var now = Date.now();
        var start = new Date(s.date_start).getTime();
        var end   = new Date(s.date_end).getTime();
        if (now >= start && now <= end) return "live";
        if (now < start) return "upcoming";
        return "completed";
    }

    function sessionIcon(s) {
        if (s.session_type === "Practice") {
            var m = s.session_name.match(/(\d)/);
            return "FP" + (m ? m[1] : "");
        }
        if (s.session_type === "Qualifying") return "Q";
        if (s.session_type === "Race")       return "R";
        if (s.session_type === "Sprint")     return "SPR";
        if (s.session_name.indexOf("Sprint Qualifying") >= 0) return "SQ";
        if (s.session_name.indexOf("Sprint Shootout")   >= 0) return "SS";
        return s.session_type.substring(0, 2).toUpperCase();
    }

    function iconColors(s) {
        var t = s.session_type.toLowerCase();
        if (t.indexOf("practice")   >= 0) return { bg: "rgba(0,188,212,0.1)",  color: "#00bcd4", border: "rgba(0,188,212,0.25)" };
        if (t.indexOf("qualifying") >= 0) return { bg: "rgba(255,214,0,0.1)",  color: "#ffd600", border: "rgba(255,214,0,0.25)" };
        if (t === "race")                 return { bg: "rgba(225,6,0,0.12)",   color: "#e10600", border: "rgba(225,6,0,0.3)" };
        if (t.indexOf("sprint")     >= 0) return { bg: "rgba(255,152,0,0.1)", color: "#ff9800", border: "rgba(255,152,0,0.25)" };
        return                                   { bg: "rgba(0,188,212,0.1)",  color: "#00bcd4", border: "rgba(0,188,212,0.25)" };
    }

    // ── Widget namespace ────────────────────────────────────────────────────
    vis.binds["f1"] = vis.binds["f1"] || {};

    // Test-only export of pure helpers (stripped/ignored in production)
    vis.binds["f1"]._test = {
        FLAGS: FLAGS, GP_NAMES: GP_NAMES,
        pad2: pad2, i18n: i18n,
        fmtTime: fmtTime, fmtDateShort: fmtDateShort, fmtDateLong: fmtDateLong,
        sessionStatus: sessionStatus, sessionIcon: sessionIcon, iconColors: iconColors
    };

}());
```

- [ ] **Step 3.4: Run tests — expect PASS**

```bash
npm run test:widgets
```

Expected: all helper tests pass (sessionStatus, sessionIcon, pad2, i18n, FLAGS, GP_NAMES).

- [ ] **Step 3.5: Commit**

```bash
git add widgets/f1-sessions/js/f1-sessions.js test/widgets/f1-sessions.test.js
git commit -m "feat: add f1-sessions widget helper functions with unit tests"
```

---

## Task 4: Render Function

**Files:**
- Modify: `widgets/f1-sessions/js/f1-sessions.js` (append `renderSessions`)

No additional tests needed here — rendering is DOM/visual output best verified in the browser preview (Task 7).

- [ ] **Step 4.1: Append `renderSessions` to `f1-sessions.js`**

Add the following **inside the IIFE, after the `vis.binds["f1"]._test` block**:

```js
    // ── Placeholder helper ──────────────────────────────────────────────────
    function placeholder(msg, bg) {
        return '<div style="font-family:Segoe UI,sans-serif;background:' + bg +
               ';padding:40px;text-align:center;color:#666;border-radius:8px;width:100%;height:100%;">' +
               msg + '</div>';
    }

    // ── renderSessions ──────────────────────────────────────────────────────
    vis.binds["f1"].renderSessions = function (sessions, props, widgetID) {
        var lang = props.language || "de";
        var tz   = props.timezone || "Europe/Vienna";
        var C    = {
            bg:      props.color_bg          || "#15151f",
            card:    props.color_card         || "#1a1a28",
            card2:   "#1c1c2a",
            border:  "#2a2a3a",
            text:    props.color_text         || "#eeeeef",
            muted:   props.color_text_muted   || "#666678",
            dim:     "#444455",
            accent:  props.color_accent       || "#e10600",
            green:   "#00e676",
            yellow:  "#ffd600"
        };
        var hdrSz = props.font_size_header  || "22px";
        var sesSz = props.font_size_session || "13px";
        var timSz = props.font_size_time    || "16px";

        if (!sessions || !sessions.length) {
            return placeholder(i18n("waiting", lang), C.bg);
        }

        var first = sessions[0];
        var flag  = FLAGS[first.country_code] || "🏁";
        var gpName = GP_NAMES[first.country_name] || (first.country_name + " GP");
        var dateRange = fmtDateShort(first.date_start, tz) + " – " +
                        fmtDateShort(sessions[sessions.length - 1].date_start, tz);

        var liveSession = null;
        var nextSession = null;
        for (var i = 0; i < sessions.length; i++) {
            var st = sessionStatus(sessions[i]);
            if (st === "live"     && !liveSession) liveSession = sessions[i];
            if (st === "upcoming" && !nextSession)  nextSession = sessions[i];
        }

        var html = "";

        // Wrapper
        html += '<div class="f1-sessions-widget" style="background:' + C.bg + ';color:' + C.text + ';border:1px solid ' + C.border + ';border-radius:8px;">';

        // Header
        html += '<div style="background:linear-gradient(135deg,' + C.accent + ',#a00400);padding:14px 18px;display:flex;justify-content:space-between;align-items:flex-start;">';
        html += '<div>';
        html += '<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.75);font-weight:600;">' + flag + ' ' + first.country_code + '</div>';
        html += '<div style="font-size:' + hdrSz + ';font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#fff;line-height:1.15;margin-top:1px;">' + gpName + '</div>';
        html += '<div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px;">' + first.circuit_short_name + ' · ' + first.location + '</div>';
        html += '</div>';
        html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">';
        if (liveSession) {
            html += '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:3px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;background:' + C.green + ';color:#111;">● LIVE</span>';
        } else if (nextSession) {
            html += '<span style="padding:3px 10px;border-radius:3px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.2);">' + i18n("upcoming", lang) + '</span>';
        }
        html += '<span style="font-size:14px;font-weight:700;color:rgba(255,255,255,0.6);">' + first.year + '</span>';
        html += '</div></div>';

        // Info bar
        html += '<div style="display:flex;justify-content:space-around;padding:10px 14px;background:' + C.card2 + ';border-bottom:1px solid ' + C.border + ';">';
        var infoItems = [
            { lbl: i18n("circuit", lang),  val: first.circuit_short_name },
            { lbl: i18n("date", lang),     val: dateRange },
            { lbl: i18n("sessions", lang), val: String(sessions.length) },
            { lbl: i18n("timeIn", lang),   val: tz.split("/")[1] || tz }
        ];
        for (var ii = 0; ii < infoItems.length; ii++) {
            html += '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">';
            html += '<span style="color:' + C.muted + ';text-transform:uppercase;font-size:8px;letter-spacing:1.2px;font-weight:600;">' + infoItems[ii].lbl + '</span>';
            html += '<span style="color:#ddd;font-weight:700;font-size:11px;">' + infoItems[ii].val + '</span>';
            html += '</div>';
        }
        html += '</div>';

        // Section title
        html += '<div style="padding:12px 18px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:#777;display:flex;align-items:center;gap:8px;">';
        html += i18n("schedule", lang);
        html += '<span style="flex:1;height:1px;background:' + C.border + ';display:inline-block;"></span>';
        html += '</div>';

        // Session rows
        for (var si = 0; si < sessions.length; si++) {
            var s      = sessions[si];
            var status = sessionStatus(s);
            var icon   = sessionIcon(s);
            var ic     = iconColors(s);
            var isLive = status === "live";
            var isNext = !liveSession && nextSession && s.session_key === nextSession.session_key;

            var rowBg     = (si % 2 === 0) ? C.card : C.bg;
            var leftBorder = "none";
            var padLeft    = "18px";
            if (isLive) {
                rowBg = "rgba(0,230,118,0.05)"; leftBorder = "3px solid " + C.green; padLeft = "15px";
            } else if (isNext) {
                rowBg = "rgba(255,214,0,0.03)"; leftBorder = "3px solid " + C.yellow; padLeft = "15px";
            }

            html += '<div style="display:flex;align-items:center;padding:10px 18px 10px ' + padLeft + ';gap:12px;border-bottom:1px solid rgba(42,42,58,0.4);background:' + rowBg + ';border-left:' + leftBorder + ';">';

            // Badge icon
            html += '<div style="width:38px;height:38px;min-width:38px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;background:' + ic.bg + ';color:' + ic.color + ';border:1px solid ' + ic.border + ';">' + icon + '</div>';

            // Name + date
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="font-size:' + sesSz + ';font-weight:700;color:' + (status === "completed" ? "#666" : C.text) + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + s.session_name + '</div>';
            html += '<div style="font-size:10px;color:#888;">' + fmtDateLong(s.date_start, tz) + ' · ' + fmtTime(s.date_start, tz) + ' – ' + fmtTime(s.date_end, tz) + '</div>';
            html += '</div>';

            // Time + tag
            html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;white-space:nowrap;">';
            html += '<span style="font-size:' + timSz + ';font-weight:700;color:' + (status === "completed" ? "#555" : C.text) + ';">' + fmtTime(s.date_start, tz) + '</span>';
            if (isLive) {
                html += '<span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;padding:2px 7px;border-radius:2px;background:' + C.green + ';color:#111;">' + i18n("live", lang) + '</span>';
            } else if (isNext) {
                html += '<span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;padding:2px 7px;border-radius:2px;color:' + C.yellow + ';background:rgba(255,214,0,0.12);border:1px solid rgba(255,214,0,0.25);">' + i18n("next", lang) + '</span>';
            } else if (status === "completed") {
                html += '<span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;padding:2px 7px;border-radius:2px;color:#555;background:rgba(100,100,120,0.1);">' + i18n("done", lang) + '</span>';
            } else {
                html += '<span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;padding:2px 7px;border-radius:2px;color:#aaa;background:rgba(150,150,180,0.08);">' + i18n("planned", lang) + '</span>';
            }
            html += '</div></div>';
        }

        // Countdown section
        if (props.show_countdown !== false && (liveSession || nextSession)) {
            var cdTarget = liveSession ? liveSession : nextSession;
            var cdLabel  = liveSession
                ? (liveSession.session_name + (lang === "de" ? " läuft" : " running"))
                : ((lang === "de" ? "Nächste: " : "Next: ") + nextSession.session_name);

            html += '<div style="padding:10px 18px 0;font-size:9px;text-transform:uppercase;letter-spacing:2px;color:' + C.muted + ';text-align:center;font-weight:600;background:' + C.card2 + ';border-top:1px solid ' + C.border + ';">' + cdLabel + '</div>';
            html += '<div style="display:flex;justify-content:center;align-items:flex-start;gap:6px;padding:10px 18px 14px;background:' + C.card2 + ';">';

            var valColor = liveSession ? C.green : C.text;
            var lblStyle = "font-size:7px;text-transform:uppercase;letter-spacing:1.5px;color:" + C.dim + ";font-weight:600;margin-top:3px;";
            var sepStyle = "font-size:24px;font-weight:300;color:" + C.dim + ";line-height:1;";

            html += '<div style="display:flex;flex-direction:column;align-items:center;min-width:40px;">';
            html += '<span id="' + widgetID + '-cd-h" style="font-size:24px;font-weight:900;line-height:1;color:' + valColor + ';">--</span>';
            html += '<span style="' + lblStyle + '">' + (lang === "de" ? "Std" : "h") + '</span></div>';
            html += '<span style="' + sepStyle + '">:</span>';
            html += '<div style="display:flex;flex-direction:column;align-items:center;min-width:40px;">';
            html += '<span id="' + widgetID + '-cd-m" style="font-size:24px;font-weight:900;line-height:1;color:' + valColor + ';">--</span>';
            html += '<span style="' + lblStyle + '">' + (lang === "de" ? "Min" : "m") + '</span></div>';
            html += '<span style="' + sepStyle + '">:</span>';
            html += '<div style="display:flex;flex-direction:column;align-items:center;min-width:40px;">';
            html += '<span id="' + widgetID + '-cd-s" style="font-size:24px;font-weight:900;line-height:1;color:' + valColor + ';">--</span>';
            html += '<span style="' + lblStyle + '">' + (lang === "de" ? "Sek" : "s") + '</span></div>';
            html += '</div>';
        }

        // Footer
        html += '<div style="padding:8px 18px;text-align:center;font-size:8px;color:' + C.dim + ';letter-spacing:1.5px;text-transform:uppercase;background:' + C.card2 + ';">F1 · ioBroker · OpenF1</div>';

        html += '</div>'; // close wrapper
        return html;
    };
```

- [ ] **Step 4.2: Verify existing tests still pass**

```bash
npm run test:widgets
```

Expected: same tests pass as before (helpers not broken).

- [ ] **Step 4.3: Commit**

```bash
git add widgets/f1-sessions/js/f1-sessions.js
git commit -m "feat: add f1-sessions renderSessions function"
```

---

## Task 5: Countdown Logic

**Files:**
- Modify: `widgets/f1-sessions/js/f1-sessions.js` (append `startCountdown`)

- [ ] **Step 5.1: Append `startCountdown` to `f1-sessions.js`**

Add inside the IIFE, after `renderSessions`:

```js
    // ── startCountdown ──────────────────────────────────────────────────────
    vis.binds["f1"].startCountdown = function (widgetID, sessions, props) {
        if (props.show_countdown === false) return;

        var liveSession = null;
        var nextSession = null;
        for (var i = 0; i < sessions.length; i++) {
            var st = sessionStatus(sessions[i]);
            if (st === "live"     && !liveSession) liveSession = sessions[i];
            if (st === "upcoming" && !nextSession)  nextSession = sessions[i];
        }

        var target = liveSession || nextSession;
        if (!target) return;

        var targetTime = liveSession
            ? new Date(liveSession.date_end).getTime()
            : new Date(nextSession.date_start).getTime();

        var interval = setInterval(function () {
            // Stop if widget was removed from the DOM
            if (!$("#" + widgetID).length) {
                clearInterval(interval);
                return;
            }

            var diff = targetTime - Date.now();
            if (diff <= 0) {
                clearInterval(interval);
                $("#" + widgetID + "-cd-h").text("00");
                $("#" + widgetID + "-cd-m").text("00");
                $("#" + widgetID + "-cd-s").text("00");
                return;
            }

            var h = Math.floor(diff / 3600000);
            var m = Math.floor((diff % 3600000) / 60000);
            var s = Math.floor((diff % 60000) / 1000);

            $("#" + widgetID + "-cd-h").text(pad2(h));
            $("#" + widgetID + "-cd-m").text(pad2(m));
            $("#" + widgetID + "-cd-s").text(pad2(s));
        }, 1000);
    };
```

- [ ] **Step 5.2: Verify tests still pass**

```bash
npm run test:widgets
```

Expected: all pass.

- [ ] **Step 5.3: Commit**

```bash
git add widgets/f1-sessions/js/f1-sessions.js
git commit -m "feat: add f1-sessions countdown logic"
```

---

## Task 6: Widget Binding (VIS subscription)

**Files:**
- Modify: `widgets/f1-sessions/js/f1-sessions.js` (append `createSessionsWidget`)

- [ ] **Step 6.1: Append `createSessionsWidget` to `f1-sessions.js`**

Add inside the IIFE, after `startCountdown`:

```js
    // ── createSessionsWidget ────────────────────────────────────────────────
    vis.binds["f1"].createSessionsWidget = function (el, view, data, style) {
        var $div     = $(el);
        var widgetID = el.id;

        var props = {
            oid:              data.attr("oid")              || "f1.0.weekend_sessions.sessions_json",
            color_accent:     data.attr("color_accent")     || "#e10600",
            color_bg:         data.attr("color_bg")         || "#15151f",
            color_card:       data.attr("color_card")       || "#1a1a28",
            color_text:       data.attr("color_text")       || "#eeeeef",
            color_text_muted: data.attr("color_text_muted") || "#666678",
            font_size_header: data.attr("font_size_header") || "22px",
            font_size_session:data.attr("font_size_session")|| "13px",
            font_size_time:   data.attr("font_size_time")   || "16px",
            timezone:         data.attr("timezone")         || "Europe/Vienna",
            language:         data.attr("language")         || "de",
            show_countdown:   data.attr("show_countdown") !== "false"
        };
        var oid  = props.oid;
        var lang = props.language;

        if (!oid) {
            $div.html(placeholder(i18n("noOid", lang), props.color_bg));
            return;
        }

        function applyData(jsonVal) {
            if (!jsonVal) {
                $div.html(placeholder(i18n("waiting", lang), props.color_bg));
                return;
            }
            var sessions;
            try {
                sessions = typeof jsonVal === "object" ? jsonVal : JSON.parse(jsonVal);
            } catch (e) {
                $div.html(placeholder(i18n("invalid", lang), props.color_bg));
                console.warn("f1-sessions: JSON parse error", e);
                return;
            }
            $div.html(vis.binds["f1"].renderSessions(sessions, props, widgetID));
            vis.binds["f1"].startCountdown(widgetID, sessions, props);
        }

        // Initial state value
        vis.conn.getStates(oid, function (err, states) {
            if (!err && states && states[oid] && states[oid].val) {
                applyData(states[oid].val);
            } else {
                $div.html(placeholder(i18n("waiting", lang), props.color_bg));
            }
        });

        // Live updates
        vis.conn.subscribe([oid]);
        vis.conn._socket.on("stateChange", function (id, state) {
            if (id === oid && $("#" + widgetID).length) {
                applyData(state ? state.val : null);
            }
        });
    };
```

- [ ] **Step 6.2: Verify tests still pass**

```bash
npm run test:widgets
```

Expected: all pass.

- [ ] **Step 6.3: Commit**

```bash
git add widgets/f1-sessions/js/f1-sessions.js
git commit -m "feat: add f1-sessions VIS widget binding and subscription"
```

---

## Task 7: VIS1 Entry Point (`f1.html`)

**Files:**
- Create: `widgets/f1.html`

- [ ] **Step 7.1: Create `widgets/f1.html`**

```html
<!--
    ioBroker.f1 — VIS1 Widgets
    Entry point: loaded by VIS1 from iobroker.vis/www/widgets/f1.html
-->

<!-- ── F1 Sessions Widget ─────────────────────────────────── -->
<script type="text/javascript" src="widgets/f1-sessions/js/f1-sessions.js"></script>
<link rel="stylesheet" href="widgets/f1-sessions/css/f1-sessions.css">

<script id="tplF1Sessions"
        type="text/ejs"
        class="vis-tpl"
        data-vis-set="f1"
        data-vis-type="static"
        data-vis-name="F1 Sessions"
        data-vis-prev='<div style="width:120px;height:80px;background:#15151f;border-radius:6px;display:flex;flex-direction:column;overflow:hidden;"><div style="background:linear-gradient(135deg,#e10600,#a00400);padding:6px 8px;"><div style="font-size:8px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:0.5px;">Japanese GP</div><div style="font-size:6px;color:rgba(255,255,255,0.7);">Suzuka · 2026</div></div><div style="padding:4px 6px;display:flex;flex-direction:column;gap:2px;"><div style="display:flex;align-items:center;gap:4px;"><div style="width:14px;height:14px;border-radius:2px;background:rgba(0,188,212,0.2);color:#00bcd4;font-size:5px;display:flex;align-items:center;justify-content:center;font-weight:800;">FP1</div><div style="font-size:6px;color:#eee;">Practice 1</div><div style="font-size:6px;color:#888;margin-left:auto;">11:30</div></div><div style="display:flex;align-items:center;gap:4px;"><div style="width:14px;height:14px;border-radius:2px;background:rgba(255,214,0,0.2);color:#ffd600;font-size:5px;display:flex;align-items:center;justify-content:center;font-weight:800;">Q</div><div style="font-size:6px;color:#eee;">Qualifying</div><div style="font-size:6px;color:#888;margin-left:auto;">15:00</div></div></div></div>'
        data-vis-attrs="oid;color_accent[#e10600]/color;color_bg[#15151f]/color;color_card[#1a1a28]/color;color_text[#eeeeef]/color;color_text_muted[#666678]/color;font_size_header[22px];font_size_session[13px];font_size_time[16px];timezone[Europe/Vienna];language[de];show_countdown[true]/checkbox">
  <div class="vis-widget <%== this.data.attr('class') %>"
       id="<%= this.data.attr('wid') %>"
       style="width:440px;height:600px;overflow:hidden;"
       <%= (el) -> vis.binds["f1"].createSessionsWidget(el, view, data, style) %>>
    <div style="padding:20px;text-align:center;color:#666;">Loading…</div>
  </div>
</script>
```

- [ ] **Step 7.2: Verify file exists and is valid HTML**

```bash
ls -la widgets/f1.html
node -e "
var fs = require('fs');
var content = fs.readFileSync('widgets/f1.html', 'utf8');
if (content.includes('tplF1Sessions') && content.includes('data-vis-set')) {
    console.log('f1.html OK');
} else {
    console.error('f1.html missing expected content');
    process.exit(1);
}"
```

Expected: `f1.html OK`

- [ ] **Step 7.3: Run full test suite**

```bash
npm test && npm run test:widgets
```

Expected: all tests pass.

- [ ] **Step 7.4: Commit**

```bash
git add widgets/f1.html
git commit -m "feat: add f1.html VIS1 entry point for f1-sessions widget"
```

---

## Task 8: Manual VIS1 Verification

These steps are done manually in the ioBroker dev-server. No automated test can cover VIS1 widget rendering.

- [ ] **Step 8.1: Sync widgets to dev-server**

```bash
# 1. Copy widgets to the adapter's node_modules folder
cp -r widgets/ .dev-server/node_modules/iobroker.f1/widgets/

# 2. Copy f1.html and widget subfolder to VIS www/widgets/
#    f1.html must sit directly in www/widgets/ (not in a subdirectory)
cp widgets/f1.html .dev-server/node_modules/iobroker.vis/www/widgets/f1.html
cp -r widgets/f1-sessions/ .dev-server/node_modules/iobroker.vis/www/widgets/f1-sessions/

# 3. Upload to ioBroker files so VIS serves them
node .dev-server/node_modules/.bin/iobroker upload vis 2>/dev/null || \
    echo "Run 'iobroker upload vis' manually in the dev-server shell"
```

VIS1 resolves asset paths like `src="widgets/f1-sessions/js/f1-sessions.js"` relative to the VIS www root, so `f1-sessions/` must exist directly under `www/widgets/`.

- [ ] **Step 8.2: Open VIS editor and verify widget palette**

1. Open the ioBroker dev-server admin UI
2. Open VIS editor
3. In the widget panel, look for group **"f1"** — the widget **"F1 Sessions"** should appear with the dark-red mini preview thumbnail
4. If not visible: check browser console for JS errors, reload VIS

- [ ] **Step 8.3: Place widget and configure OID**

1. Drag "F1 Sessions" onto a view
2. In the property panel, set `oid` to `f1.0.weekend_sessions.sessions_json`
3. Verify the session schedule renders with the Bold F1 style (red header, badge icons, rows)
4. Check that the countdown section updates every second

- [ ] **Step 8.4: Verify style properties**

1. Change `color_accent` to another colour → header gradient changes
2. Change `font_size_header` to `30px` → GP name grows
3. Set `language` to `en` → labels switch to English
4. Set `show_countdown` to unchecked → countdown section disappears

- [ ] **Step 8.5: Verify multi-instance independence**

1. Place a second "F1 Sessions" widget on the same view
2. Set different `color_accent` on each
3. Verify both countdown timers tick independently and show the same time (they read the same data, not interfere)

- [ ] **Step 8.6: Final commit**

```bash
git add widgets/ test/widgets/ package.json
git commit -m "feat: complete f1-sessions VIS1 widget"
```
