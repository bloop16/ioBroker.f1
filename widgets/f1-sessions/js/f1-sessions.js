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
