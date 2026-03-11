vis.binds["f1"].createChampionshipTeamsWidget = function (el, view, data, style) {
    var $div = $(el);
    var widgetID = el.id;

    var oid = "f1.0.standings.teams";

    function applyTeams(teams) {
        var $content = $div.find(".f1-championship-teams-content");
        $content.empty();

        if (!teams || !teams.length) {
            $content.html('<div class="f1-championship-teams-empty">No standings available</div>');
            return;
        }

        var sorted = teams.slice().sort(function (a, b) {
            return (a.position || 99) - (b.position || 99);
        });

        sorted.forEach(function (team) {
            var teamColor = team.team_colour ? "#" + team.team_colour : "#666666";

            var $row = $('<div class="f1-championship-teams-row"></div>');
            $row.append('<span class="f1-championship-teams-position">' + (team.position || '?') + '</span>');
            $row.append('<div class="f1-championship-teams-team-bar" style="background:' + teamColor + '"></div>');

            var $info = $('<div class="f1-championship-teams-info"></div>');
            $info.append('<div class="f1-championship-teams-name">' + (team.team_name || '') + '</div>');
            $row.append($info);

            $row.append('<span class="f1-championship-teams-points">' + (team.points || 0) + '</span>');

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

    vis.conn.subscribe([oid]);
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
};
