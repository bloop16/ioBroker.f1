/*
    ioBroker.f1 - Race Countdown Widget
    VIS1 Widget Implementation
*/

vis.binds["f1"] = vis.binds["f1"] || {};
vis.binds["f1"].version = "0.1.0";
vis.binds["f1"].showVersion = function () {
    if (vis.binds["f1"].version) {
        console.log("Version f1: " + vis.binds["f1"].version);
        vis.binds["f1"].version = null;
    }
};

vis.binds["f1"]._readWidgetAttr = function (widgetData, key) {
    if (!widgetData) return undefined;
    if (typeof widgetData.attr === "function") return widgetData.attr(key);
    if (widgetData[key] !== undefined) return widgetData[key];
    if (widgetData.data && widgetData.data[key] !== undefined) return widgetData.data[key];
    return undefined;
};

// Shared style helper — reads VIS widget attrs and sets CSS custom properties
vis.binds["f1"]._applyStyle = function (el, widgetData, defaultAccent) {
    var accent   = vis.binds["f1"]._readWidgetAttr(widgetData, "accentColor")   || defaultAccent || "#9D4EDD";
    var bg       = vis.binds["f1"]._readWidgetAttr(widgetData, "bgColor")       || "#1a1a1a";
    var headerBg = vis.binds["f1"]._readWidgetAttr(widgetData, "headerBgColor") || "#242424";
    var radius   = vis.binds["f1"]._readWidgetAttr(widgetData, "borderRadius");
    var fontSize = vis.binds["f1"]._readWidgetAttr(widgetData, "fontSize");
    el.style.setProperty('--f1-accent',    accent);
    el.style.setProperty('--f1-bg',        bg);
    el.style.setProperty('--f1-header-bg', headerBg);
    if (radius)   el.style.setProperty('--f1-radius',    parseInt(radius, 10) + 'px');
    if (fontSize) el.style.setProperty('--f1-font-size', parseInt(fontSize, 10) + 'px');
};

vis.binds["f1"].createWidget = function (el, view, data, style) {
    vis.binds["f1"]._applyStyle(el, data, '#9D4EDD');
        var $div = $(el);
        var widgetID = el.id;
        var oid = "f1.0.next_race.json";

    if (!vis.conn || typeof vis.conn.getStates !== "function") {
        return;
    }

        function applyJson(jsonStr) {
            if (!jsonStr) return;
            var race;
            try { race = (typeof jsonStr === "object") ? jsonStr : JSON.parse(jsonStr); }
            catch (e) { return; }

            $div.find(".f1-countdown-circuit-name")
                .text(race.circuit_short_name || "–");
            $div.find(".f1-countdown-location-text")
                .text([race.country_name, race.location].filter(Boolean).join(" • ") || "–");

            if (race.date_start) {
                var d = new Date(race.date_start);
                var days = Math.ceil((d - new Date()) / 86400000);
                $div.find(".f1-countdown-days").text(days > 0 ? days : 0);
                $div.find(".f1-countdown-date-text").text("📅 " + d.toLocaleString(undefined, {
                    year: "numeric", month: "2-digit", day: "2-digit",
                    hour: "2-digit", minute: "2-digit", timeZoneName: "short"
                }));
            }
        }

        // Get initial value via vis.conn (handles connection state properly)
        vis.conn.getStates(oid, function (err, states) {
            if (!err && states && states[oid]) {
                applyJson(states[oid].val);
            }
        });

        // Subscribe and listen for live updates
        if (typeof vis.conn.subscribe === "function") {
            vis.conn.subscribe([oid]);
        }
        if (vis.conn._socket && typeof vis.conn._socket.on === "function") {
            vis.conn._socket.on("stateChange", function (id, state) {
                if (id === oid && $("#" + widgetID).length) {
                    applyJson(state ? state.val : null);
                }
            });
        }
};

vis.binds["f1"].showVersion();
