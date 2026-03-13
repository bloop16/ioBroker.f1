vis.binds["f1"] = vis.binds["f1"] || {};

vis.binds["f1"].createChampionshipTeamsWidget = function (el, view, data, style) {
    if (typeof vis.binds["f1"]._applyStyle === "function") {
        vis.binds["f1"]._applyStyle(el, data, "#10b981");
    }
    var $div = $(el);
    var widgetID = el.id;

    var oid = "f1.0.standings.teams";

    if (!vis.conn || typeof vis.conn.getStates !== "function") {
        return;
    }

    // standings.teams has: {name, colour} only — no position/points fields
    function applyTeams(teams) {
        var $content = $div.find(".f1-championship-teams-content");
        $content.empty();

        if (!teams || !teams.length) {
            $content.html('<div class="f1-championship-teams-empty">No team data available</div>');
            return;
        }

        var sorted = teams.slice().sort(function (a, b) {
            return (a.name || "").localeCompare(b.name || "");
        });

        sorted.forEach(function (team, idx) {
            var teamColor = team.colour ? "#" + team.colour : "#666666";

            var $row = $('<div class="f1-championship-teams-row"></div>');
            $row.append('<span class="f1-championship-teams-position">' + (idx + 1) + '</span>');
            $row.append('<div class="f1-championship-teams-team-bar" style="background:' + teamColor + '"></div>');

            var $info = $('<div class="f1-championship-teams-info"></div>');
            $info.append('<div class="f1-championship-teams-name">' + (team.name || '') + '</div>');
            $row.append($info);

            $content.append($row);
        });
    }

    function loadTeams() {
        vis.conn.getStates(oid, function (err, states) {
            if (!err && states && states[oid] && states[oid].val) {
                try {
                    var teams = typeof states[oid].val === "string"
                        ? JSON.parse(states[oid].val)
                        : states[oid].val;
                    applyTeams(teams);
                } catch (e) {}
            }
        });
    }

    loadTeams();

    if (typeof vis.conn.subscribe === "function") {
        vis.conn.subscribe([oid]);
    }
    if (vis.conn._socket && typeof vis.conn._socket.on === "function") {
        vis.conn._socket.on("stateChange", function (id, state) {
            if (id === oid && $("#" + widgetID).length) {
                try {
                    var teams = state && state.val
                        ? (typeof state.val === "string" ? JSON.parse(state.val) : state.val)
                        : null;
                    applyTeams(teams);
                } catch (e) {}
            }
        });
    }
};
