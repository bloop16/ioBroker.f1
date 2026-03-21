/*
    ioBroker.f1 - Live Standings Widget
    Part of vis.binds["f1"]
*/

// This will be merged into existing vis.binds["f1"] object
// For now, standalone version for reference

vis.binds["f1"].createStandingsWidget = function (el, view, data, style) {
	var $div = $(el);
	var widgetID = el.id;

	// Default team colors (fallback)
	var teamColors = {
		1: "#6692FF", // Red Bull Racing
		11: "#DC0000", // Ferrari
		44: "#00D2BE", // Mercedes
		4: "#FF8700", // McLaren
		14: "#006F62", // Aston Martin
		10: "#0090FF", // Alpine
		23: "#2B4562", // Williams
		20: "#B6BABD", // Haas
		22: "#1E41FF", // AlphaTauri
		77: "#900000", // Alfa Romeo/Sauber
	};

	function applyPositions(posData) {
		var $content = $div.find(".f1-standings-content");
		$content.empty();

		if (!posData || !posData.length) {
			$content.html('<div class="f1-standings-empty">No position data available</div>');
			return;
		}

		// Sort by position
		var sorted = posData.sort(function (a, b) {
			return (a.position || 99) - (b.position || 99);
		});

		// Find fastest lap
		var fastestLap = null;
		sorted.forEach(function (driver) {
			if (driver.laptime && (!fastestLap || driver.laptime < fastestLap)) {
				fastestLap = driver.laptime;
			}
		});

		sorted.forEach(function (driver) {
			var isFastest = driver.laptime === fastestLap;
			var teamColor = teamColors[driver.driver_number] || "#666666";

			var $row = $('<div class="f1-standings-row' + (isFastest ? " fastest-lap" : "") + '"></div>');

			// Position
			$row.append('<span class="f1-standings-position">P' + (driver.position || "?") + "</span>");

			// Team color bar
			$row.append('<div class="f1-standings-team-bar" style="background:' + teamColor + '"></div>');

			// Driver (number + TLA or name)
			var driverText = driver.driver_number
				? "#" + driver.driver_number
				: driver.name_acronym || driver.full_name || "?";
			$row.append('<span class="f1-standings-driver">' + driverText + "</span>");

			// Gap to leader
			var gap = driver.position === 1 ? "Leader" : driver.gap_to_leader || "--";
			$row.append('<span class="f1-standings-gap">' + gap + "</span>");

			// Last lap time
			var laptimeClass = isFastest ? "fastest" : "";
			var laptime = driver.laptime || "--";
			$row.append('<span class="f1-standings-laptime ' + laptimeClass + '">' + laptime + "</span>");

			$content.append($row);
		});
	}

	// Subscribe to positions.current
	var oid = "f1.0.positions.current";

	vis.conn.getStates(oid, function (err, states) {
		if (!err && states && states[oid]) {
			try {
				var data = typeof states[oid].val === "string" ? JSON.parse(states[oid].val) : states[oid].val;
				applyPositions(data);
			} catch (e) {
				console.error("F1 Standings parse error:", e);
			}
		}
	});

	vis.conn.subscribe([oid]);
	vis.conn._socket.on("stateChange", function (id, state) {
		if (id === oid && $("#" + widgetID).length) {
			try {
				var data =
					state && state.val ? (typeof state.val === "string" ? JSON.parse(state.val) : state.val) : null;
				applyPositions(data);
			} catch (e) {
				console.error("F1 Standings update error:", e);
			}
		}
	});
};
