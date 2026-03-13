vis.binds["f1"] = vis.binds["f1"] || {};

vis.binds["f1"].createChampionshipDriversWidget = function (el, view, data, style) {
    if (typeof vis.binds["f1"]._applyStyle === "function") {
        vis.binds["f1"]._applyStyle(el, data, "#fbbf24");
    }
    var $div = $(el);
    var widgetID = el.id;

    var oid = "f1.0.standings.drivers";

    if (!vis.conn || typeof vis.conn.getStates !== "function") {
        return;
    }

    // standings.drivers has: driver_number, name_acronym, full_name, team_name, team_colour
    // No position/points fields — adapter sorts by team+number, so we show sequential index
    function applyDrivers(drivers) {
        var $content = $div.find(".f1-championship-drivers-content");
        $content.empty();

        if (!drivers || !drivers.length) {
            $content.html('<div class="f1-championship-drivers-empty">No driver data available</div>');
            return;
        }

        drivers.forEach(function (driver, idx) {
            var teamColor = driver.team_colour ? "#" + driver.team_colour : "#666666";

            var $row = $('<div class="f1-championship-drivers-row"></div>');
            $row.append('<span class="f1-championship-drivers-position">' + (idx + 1) + '</span>');
            $row.append('<div class="f1-championship-drivers-team-bar" style="background:' + teamColor + '"></div>');

            var $info = $('<div class="f1-championship-drivers-info"></div>');
            $info.append('<div class="f1-championship-drivers-name">' + (driver.full_name || driver.name_acronym || '#' + driver.driver_number) + '</div>');
            $info.append('<div class="f1-championship-drivers-team">' + (driver.team_name || '') + '</div>');
            $row.append($info);

            $row.append('<span class="f1-championship-drivers-number">#' + driver.driver_number + '</span>');

            $content.append($row);
        });
    }

    function loadDrivers() {
        vis.conn.getStates(oid, function (err, states) {
            if (!err && states && states[oid] && states[oid].val) {
                try {
                    var drivers = typeof states[oid].val === "string"
                        ? JSON.parse(states[oid].val)
                        : states[oid].val;
                    applyDrivers(drivers);
                } catch (e) {}
            }
        });
    }

    loadDrivers();

    if (typeof vis.conn.subscribe === "function") {
        vis.conn.subscribe([oid]);
    }
    if (vis.conn._socket && typeof vis.conn._socket.on === "function") {
        vis.conn._socket.on("stateChange", function (id, state) {
            if (id === oid && $("#" + widgetID).length) {
                try {
                    var drivers = state && state.val
                        ? (typeof state.val === "string" ? JSON.parse(state.val) : state.val)
                        : null;
                    applyDrivers(drivers);
                } catch (e) {}
            }
        });
    }
};
