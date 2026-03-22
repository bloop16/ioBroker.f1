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
        return (n < 10 ? "0" : "") + n;
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
        return "completed"; // also covers missing/invalid dates (NaN comparisons → false)
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

}());
