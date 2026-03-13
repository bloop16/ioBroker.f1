/*
    ioBroker.f1 - Live Standings Widget
    Part of vis.binds["f1"]
*/

vis.binds["f1"] = vis.binds["f1"] || {};

vis.binds["f1"].createStandingsWidget = function (el, view, data, style) {
    if (typeof vis.binds["f1"]._applyStyle === "function") {
        vis.binds["f1"]._applyStyle(el, data, "#9D4EDD");
    }

    var $div = $(el);
    var widgetID = el.id;
    var oidPositions = "f1.0.positions.current";
    var oidDrivers   = "f1.0.standings.drivers";
    var oidIntervals = "f1.0.positions.intervals";
    var driverMap  = {};  // driver_number → {name_acronym, team_colour}
    var intervalMap = {}; // driver_number → {gap_to_leader, interval}

    if (!vis.conn || typeof vis.conn.getStates !== "function") {
        return;
    }

    function applyPositions(posData) {
        var $content = $div.find(".f1-standings-content");
        $content.empty();

        if (!posData || !posData.length) {
            $content.html('<div class="f1-standings-empty">No position data available</div>');
            return;
        }

        var sorted = posData.slice().sort(function (a, b) {
            return (a.position || 99) - (b.position || 99);
        });

        sorted.forEach(function (driver) {
            var info = driverMap[driver.driver_number] || {};
            var intv = intervalMap[driver.driver_number] || {};
            var teamColor = info.team_colour ? "#" + info.team_colour : "#666666";
            var driverLabel = info.name_acronym || ("#" + driver.driver_number);
            var gap = driver.position === 1 ? "Leader" : (intv.gap_to_leader || "--");

            var $row = $('<div class="f1-standings-row"></div>');
            $row.append('<span class="f1-standings-position">P' + (driver.position || '?') + '</span>');
            $row.append('<div class="f1-standings-team-bar" style="background:' + teamColor + '"></div>');
            $row.append('<span class="f1-standings-driver">' + driverLabel + '</span>');
            $row.append('<span class="f1-standings-gap">' + gap + '</span>');
            $content.append($row);
        });
    }

    function loadPositions() {
        vis.conn.getStates(oidPositions, function (err, states) {
            if (!err && states && states[oidPositions] && states[oidPositions].val) {
                try {
                    applyPositions(typeof states[oidPositions].val === "string"
                        ? JSON.parse(states[oidPositions].val)
                        : states[oidPositions].val);
                } catch (e) { console.error("F1 Standings: position parse error", e); }
            }
        });
    }

    // Load drivers for colors, then intervals, then positions
    vis.conn.getStates(oidDrivers, function (err, states) {
        if (!err && states && states[oidDrivers] && states[oidDrivers].val) {
            try {
                var drivers = typeof states[oidDrivers].val === "string"
                    ? JSON.parse(states[oidDrivers].val) : states[oidDrivers].val;
                drivers.forEach(function (d) {
                    driverMap[d.driver_number] = { name_acronym: d.name_acronym, team_colour: d.team_colour };
                });
            } catch (e) { console.error("F1 Standings: driver parse error", e); }
        }

        vis.conn.getStates(oidIntervals, function (err2, iStates) {
            if (!err2 && iStates && iStates[oidIntervals] && iStates[oidIntervals].val) {
                try {
                    var intervals = typeof iStates[oidIntervals].val === "string"
                        ? JSON.parse(iStates[oidIntervals].val) : iStates[oidIntervals].val;
                    intervals.forEach(function (iv) { intervalMap[iv.driver_number] = iv; });
                } catch (e) { }
            }
            loadPositions();
        });
    });

    if (typeof vis.conn.subscribe === "function") {
        vis.conn.subscribe([oidPositions, oidIntervals]);
    }
    if (vis.conn._socket && typeof vis.conn._socket.on === "function") {
        vis.conn._socket.on("stateChange", function (id, state) {
            if ($("#" + widgetID).length === 0) return;
            if (id === oidIntervals && state && state.val) {
                try {
                    var intervals = typeof state.val === "string" ? JSON.parse(state.val) : state.val;
                    intervalMap = {};
                    intervals.forEach(function (iv) { intervalMap[iv.driver_number] = iv; });
                } catch (e) { }
            }
            if (id === oidPositions || id === oidIntervals) {
                loadPositions();
            }
        });
    }
};
