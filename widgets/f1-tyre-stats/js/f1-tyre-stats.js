/*
    ioBroker.f1 - Tyre Stats Card
    Part of vis.binds["f1"]
*/

vis.binds["f1"] = vis.binds["f1"] || {};

vis.binds["f1"].createTyreWidget = function (el, view, data, style) {
    if (typeof vis.binds["f1"]._applyStyle === "function") {
        vis.binds["f1"]._applyStyle(el, data, "#9D4EDD");
    }
    var $div = $(el);
    var widgetID = el.id;

    var oidStints = "f1.0.tyres.stints";
    var oidCurrent = "f1.0.tyres.current";
    var oidDrivers = "f1.0.standings.drivers";

    var driverMap = {};
    var currentTyres = {};

    if (!vis.conn || typeof vis.conn.getStates !== "function") {
        return;
    }

    function applyData() {
        var $content = $div.find(".f1-tyre-content");
        $content.empty();

        if (!Object.keys(driverMap).length) {
            $content.html('<div class="f1-tyre-empty">No tyre data available</div>');
            return;
        }

        // Build driver rows
        var drivers = Object.values(driverMap);
        drivers.forEach(function (driver) {
            var teamColor = driver.team_colour ? "#" + driver.team_colour : "#666666";
            var current = currentTyres[driver.driver_number] || {};

            var $row = $('<div class="f1-tyre-driver-row"></div>');

            // Team bar
            $row.append('<div class="f1-tyre-team-bar" style="background:' + teamColor + '"></div>');

            // Driver info
            var $info = $('<div class="f1-tyre-driver-info"></div>');
            $info.append('<div class="f1-tyre-driver-name">' + (driver.name_acronym || driver.full_name || '#' + driver.driver_number) + '</div>');

            // Current tyre
            if (current.compound) {
                var $current = $('<div class="f1-tyre-current"></div>');
                $current.append(
                    '<div class="f1-tyre-compound ' + current.compound + '" style="' +
                    (current.compound === 'SOFT' ? 'background:#ff0000;color:#fff;' :
                     current.compound === 'MEDIUM' ? 'background:#ffff00;color:#1a1a1a;' :
                     current.compound === 'HARD' ? 'background:#ffffff;color:#1a1a1a;' :
                     current.compound === 'INTERMEDIATE' ? 'background:#00ff00;color:#1a1a1a;' :
                     current.compound === 'WET' ? 'background:#0000ff;color:#fff;' : '') +
                    '">' + current.compound + '</div>'
                );
                if (current.age != null) {
                    $current.append('<span class="f1-tyre-age">' + current.age + ' laps</span>');
                }
                $info.append($current);
            }

            // Stint history (if available)
            if (driver.stints && driver.stints.length) {
                var $history = $('<div class="f1-tyre-stint-history"></div>');
                driver.stints.forEach(function (stint) {
                    var $stint = $('<div class="f1-tyre-stint ' + stint.compound + '"></div>');
                    $stint.text(stint.laps + ' L');
                    $history.append($stint);
                });
                $info.append($history);
            }

            $row.append($info);
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
                        driverMap[d.driver_number] = {
                            driver_number: d.driver_number,
                            name_acronym: d.name_acronym,
                            full_name: d.full_name,
                            team_colour: d.team_colour,
                            stints: []
                        };
                    });
                } catch (e) {
                    console.error("F1 Tyre: driver parse error", e);
                }
            }
            loadStints();
        });
    }

    function loadStints() {
        vis.conn.getStates(oidStints, function (err, states) {
            if (!err && states && states[oidStints] && states[oidStints].val) {
                try {
                    var stints = typeof states[oidStints].val === "string"
                        ? JSON.parse(states[oidStints].val)
                        : states[oidStints].val;
                    
                    // Group by driver
                    stints.forEach(function (stint) {
                        var dn = stint.driver_number;
                        if (driverMap[dn]) {
                            var laps = (stint.lap_end || 0) - (stint.lap_start || 0);
                            driverMap[dn].stints.push({
                                compound: stint.compound,
                                laps: laps > 0 ? laps : 0
                            });
                        }
                    });
                } catch (e) {
                    console.error("F1 Tyre: stint parse error", e);
                }
            }
            loadCurrent();
        });
    }

    function loadCurrent() {
        vis.conn.getStates(oidCurrent, function (err, states) {
            if (!err && states && states[oidCurrent] && states[oidCurrent].val) {
                try {
                    var current = typeof states[oidCurrent].val === "string"
                        ? JSON.parse(states[oidCurrent].val)
                        : states[oidCurrent].val;
                    
                    current.forEach(function (tyre) {
                        currentTyres[tyre.driver_number] = {
                            compound: tyre.compound,
                            age: tyre.tyre_age_laps
                        };
                    });
                } catch (e) {
                    console.error("F1 Tyre: current parse error", e);
                }
            }
            applyData();
        });
    }

    loadDrivers();

    // Subscribe
    if (typeof vis.conn.subscribe === "function") {
        vis.conn.subscribe([oidStints, oidCurrent]);
    }
    if (vis.conn._socket && typeof vis.conn._socket.on === "function") {
        vis.conn._socket.on("stateChange", function (id, state) {
            if ((id === oidStints || id === oidCurrent) && $("#" + widgetID).length) {
                loadDrivers(); // Reload everything
            }
        });
    }
};
