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
            var now = Date.now();
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
        it("returns SQ for Sprint Qualifying", function() {
            assert.strictEqual(h.sessionIcon({ session_type: "Sprint Qualifying", session_name: "Sprint Qualifying" }), "SQ");
        });
        it("returns SS for Sprint Shootout", function() {
            assert.strictEqual(h.sessionIcon({ session_type: "Sprint Shootout", session_name: "Sprint Shootout" }), "SS");
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

    // ── langToLocale ───────────────────────────────────────────────────────
    describe("langToLocale", function() {
        it("maps de to de-AT", function() {
            assert.strictEqual(h.langToLocale("de"), "de-AT");
        });
        it("maps en to en-GB", function() {
            assert.strictEqual(h.langToLocale("en"), "en-GB");
        });
        it("falls back to de-AT for unknown lang", function() {
            assert.strictEqual(h.langToLocale("fr"), "de-AT");
        });
    });
});
