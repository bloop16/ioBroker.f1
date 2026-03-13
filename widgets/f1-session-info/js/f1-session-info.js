/*
    ioBroker.f1 - Session Info Widget
    Part of vis.binds["f1"]
*/

vis.binds["f1"] = vis.binds["f1"] || {};

vis.binds["f1"].createSessionWidget = function (el, view, data, style) {
    if (typeof vis.binds["f1"]._applyStyle === "function") {
        vis.binds["f1"]._applyStyle(el, data, "#9D4EDD");
    }

    var $div = $(el);
    var widgetID = el.id;

    // Correct OIDs — adapter stores these individually, no live_session.json
    var oidStatus  = "f1.0.live_session.status";
    var oidType    = "f1.0.live_session.type";
    var oidWeather = "f1.0.live_session.weather";
    var oidLatest  = "f1.0.race_control.latest_message";

    var sessionState = { status: null, type: null, weather: null, latestMsg: null };

    if (!vis.conn || typeof vis.conn.getStates !== "function") {
        return;
    }

    var flagEmoji = {
        "green": "🟢", "yellow": "🟡", "red": "🔴",
        "blue": "🔵", "white": "⚪", "allclear": "🟢",
        "scdeployed": "🟡", "vsc": "🟡", "sc": "🟡"
    };

    var sessionTypeIcons = {
        "Practice": "🏁", "Qualifying": "⏱️", "Sprint": "⚡", "Race": "🏆"
    };

    function render() {
        var $content = $div.find(".f1-session-content");
        $content.empty();

        // Session type + status
        var typeIcon = sessionTypeIcons[sessionState.type] || "🏁";
        var status = (sessionState.status || "no_session").toLowerCase().replace("_", "-");
        var $header = $('<div class="f1-session-section"></div>');
        $header.append(
            '<div class="f1-session-type">' +
            '<span class="f1-session-type-icon">' + typeIcon + '</span>' +
            '<span>' + (sessionState.type || "Session") + '</span>' +
            '</div>' +
            '<div class="f1-session-status ' + status + '">' +
            (sessionState.status || "NO SESSION").replace(/_/g, " ") +
            '</div>'
        );
        $content.append($header);

        // Weather
        if (sessionState.weather) {
            var w = sessionState.weather;
            var $weather = $('<div class="f1-session-section"></div>');
            var $grid = $('<div class="f1-session-weather"></div>');

            if (w.air_temperature != null) {
                $grid.append('<div class="f1-session-weather-item"><div class="f1-session-weather-label">🌡️ Air Temp</div><div class="f1-session-weather-value">' + w.air_temperature + '°C</div></div>');
            }
            if (w.track_temperature != null) {
                $grid.append('<div class="f1-session-weather-item"><div class="f1-session-weather-label">🏁 Track Temp</div><div class="f1-session-weather-value">' + w.track_temperature + '°C</div></div>');
            }
            if (w.wind_speed != null) {
                var windText = w.wind_speed + ' km/h' + (w.wind_direction ? ' ' + w.wind_direction : '');
                $grid.append('<div class="f1-session-weather-item"><div class="f1-session-weather-label">💨 Wind</div><div class="f1-session-weather-value">' + windText + '</div></div>');
            }
            if (w.humidity != null) {
                $grid.append('<div class="f1-session-weather-item"><div class="f1-session-weather-label">💧 Humidity</div><div class="f1-session-weather-value">' + w.humidity + '%</div></div>');
            }
            $weather.append($grid);
            $content.append($weather);
        }

        // Latest race control message
        if (sessionState.latestMsg) {
            $content.append(
                '<div class="f1-session-section">' +
                '<div class="f1-session-message">' +
                '<span class="f1-session-message-icon">📻</span>' +
                '<span class="f1-session-message-text">' + sessionState.latestMsg + '</span>' +
                '</div></div>'
            );
        }
    }

    // Initial load of all session states
    vis.conn.getStates(oidStatus, function (err, states) {
        if (!err && states && states[oidStatus]) sessionState.status = states[oidStatus].val;

        vis.conn.getStates(oidType, function (err2, s2) {
            if (!err2 && s2 && s2[oidType]) sessionState.type = s2[oidType].val;

            vis.conn.getStates(oidWeather, function (err3, s3) {
                if (!err3 && s3 && s3[oidWeather] && s3[oidWeather].val) {
                    try {
                        sessionState.weather = typeof s3[oidWeather].val === "string"
                            ? JSON.parse(s3[oidWeather].val) : s3[oidWeather].val;
                    } catch (e) { }
                }

                vis.conn.getStates(oidLatest, function (err4, s4) {
                    if (!err4 && s4 && s4[oidLatest]) sessionState.latestMsg = s4[oidLatest].val;
                    render();
                });
            });
        });
    });

    if (typeof vis.conn.subscribe === "function") {
        vis.conn.subscribe([oidStatus, oidType, oidWeather, oidLatest]);
    }
    if (vis.conn._socket && typeof vis.conn._socket.on === "function") {
        vis.conn._socket.on("stateChange", function (id, state) {
            if ($("#" + widgetID).length === 0) return;
            var val = state ? state.val : null;
            if (id === oidStatus)  { sessionState.status = val; render(); }
            else if (id === oidType) { sessionState.type = val; render(); }
            else if (id === oidWeather && val) {
                try { sessionState.weather = typeof val === "string" ? JSON.parse(val) : val; } catch (e) { }
                render();
            } else if (id === oidLatest) { sessionState.latestMsg = val; render(); }
        });
    }
};
