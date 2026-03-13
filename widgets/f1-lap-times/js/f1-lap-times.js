vis.binds["f1"] = vis.binds["f1"] || {};

vis.binds["f1"].createLapTimesWidget = function (el, view, data, style) {
    if (typeof vis.binds["f1"]._applyStyle === "function") {
        vis.binds["f1"]._applyStyle(el, data, "#3b82f6");
    }
    var $div = $(el);
    var widgetID = el.id;

    var oidLaps = "f1.0.laps.fastest";
    var oidDrivers = "f1.0.standings.drivers";

    var driverMap = {};

    if (!vis.conn || typeof vis.conn.getStates !== "function") {
        return;
    }

    // OpenF1 lap times are in seconds (not milliseconds)
    function formatTime(s) {
        if (s == null || s <= 0) return "--";
        var mins = Math.floor(s / 60);
        var secs = (s % 60).toFixed(3);
        if (parseFloat(secs) < 10) secs = "0" + secs;
        return mins + ":" + secs;
    }

    function applyLaps(laps) {
        var $content = $div.find(".f1-laptimes-content");
        $content.empty();

        if (!laps || !laps.length) {
            $content.html('<div class="f1-laptimes-empty">No lap data available</div>');
            return;
        }

        var sorted = laps.slice().sort(function (a, b) {
            return (a.lap_duration || 999999) - (b.lap_duration || 999999);
        });

        var fastestLap = sorted[0] ? sorted[0].lap_duration : null;

        sorted.slice(0, 10).forEach(function (lap) {
            var driver = driverMap[lap.driver_number] || {};
            var teamColor = driver.team_colour ? "#" + driver.team_colour : "#666666";
            var driverName = driver.name_acronym || "#" + lap.driver_number;
            var isFastest = lap.lap_duration === fastestLap;

            var $row = $('<div class="f1-laptimes-row' + (isFastest ? ' fastest' : '') + '"></div>');
            $row.append('<div class="f1-laptimes-team-bar" style="background:' + teamColor + '"></div>');
            $row.append('<span class="f1-laptimes-driver">' + driverName + '</span>');
            $row.append('<span class="f1-laptimes-time">' + formatTime(lap.lap_duration) + '</span>');

            if (lap.duration_sector_1 || lap.duration_sector_2 || lap.duration_sector_3) {
                var $sectors = $('<div class="f1-laptimes-sectors"></div>');
                $sectors.append('<span class="f1-laptimes-sector">S1: ' + formatTime(lap.duration_sector_1) + '</span>');
                $sectors.append('<span class="f1-laptimes-sector">S2: ' + formatTime(lap.duration_sector_2) + '</span>');
                $sectors.append('<span class="f1-laptimes-sector">S3: ' + formatTime(lap.duration_sector_3) + '</span>');
                $row.append($sectors);
            }

            $content.append($row);
        });
    }

    function loadDrivers() {
        vis.conn.getStates(oidDrivers, function (err, states) {
            if (!err && states && states[oidDrivers] && states[oidDrivers].val) {
                try {
                    var drivers = typeof states[oidDrivers].val === "string"
                        ? JSON.parse(states[oidDrivers].val)
                        : states[oidDrivers].val;
                    drivers.forEach(function (d) {
                        driverMap[d.driver_number] = d;
                    });
                } catch (e) {}
            }
            loadLaps();
        });
    }

    function loadLaps() {
        vis.conn.getStates(oidLaps, function (err, states) {
            if (!err && states && states[oidLaps] && states[oidLaps].val) {
                try {
                    var laps = typeof states[oidLaps].val === "string"
                        ? JSON.parse(states[oidLaps].val)
                        : states[oidLaps].val;
                    applyLaps(laps);
                } catch (e) {}
            }
        });
    }

    loadDrivers();

    if (typeof vis.conn.subscribe === "function") {
        vis.conn.subscribe([oidLaps]);
    }
    if (vis.conn._socket && typeof vis.conn._socket.on === "function") {
        vis.conn._socket.on("stateChange", function (id, state) {
            if (id === oidLaps && $("#" + widgetID).length) {
                loadDrivers();
            }
        });
    }
};
