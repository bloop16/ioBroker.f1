vis.binds["f1"].createPitstopWidget = function (el, view, data, style) {
	var $div = $(el);
	var widgetID = el.id;

	var oidPitstops = "f1.0.pit_stops.all";
	var oidDrivers = "f1.0.standings.drivers";

	var driverMap = {};

	function applyPitstops(pitstops) {
		var $content = $div.find(".f1-pitstop-content");
		$content.empty();

		if (!pitstops || !pitstops.length) {
			$content.html('<div class="f1-pitstop-empty">No pit stops yet</div>');
			return;
		}

		var sorted = pitstops.slice().sort(function (a, b) {
			return new Date(b.date) - new Date(a.date);
		});

		sorted.forEach(function (stop) {
			var driver = driverMap[stop.driver_number] || {};
			var teamColor = driver.team_colour ? "#" + driver.team_colour : "#666666";
			var driverName = driver.name_acronym || "#" + stop.driver_number;
			var duration = stop.pit_duration ? (stop.pit_duration / 1000).toFixed(1) + "s" : "--";

			var $row = $('<div class="f1-pitstop-row"></div>');
			$row.append('<div class="f1-pitstop-team-bar" style="background:' + teamColor + '"></div>');

			var $info = $('<div class="f1-pitstop-info"></div>');
			$info.append('<div class="f1-pitstop-driver">' + driverName + "</div>");

			var $details = $('<div class="f1-pitstop-details"></div>');
			$details.append('<span class="f1-pitstop-lap">🏁 Lap ' + (stop.lap_number || "?") + "</span>");
			$details.append('<span class="f1-pitstop-duration">⏱️ ' + duration + "</span>");
			$info.append($details);

			$row.append($info);
			$content.append($row);
		});
	}

	function loadDrivers() {
		vis.conn.getStates(oidDrivers, function (err, states) {
			if (!err && states && states[oidDrivers] && states[oidDrivers].val) {
				try {
					var drivers =
						typeof states[oidDrivers].val === "string"
							? JSON.parse(states[oidDrivers].val)
							: states[oidDrivers].val;
					drivers.forEach(function (d) {
						driverMap[d.driver_number] = d;
					});
				} catch (e) {}
			}
			loadPitstops();
		});
	}

	function loadPitstops() {
		vis.conn.getStates(oidPitstops, function (err, states) {
			if (!err && states && states[oidPitstops] && states[oidPitstops].val) {
				try {
					var pitstops =
						typeof states[oidPitstops].val === "string"
							? JSON.parse(states[oidPitstops].val)
							: states[oidPitstops].val;
					applyPitstops(pitstops);
				} catch (e) {}
			}
		});
	}

	loadDrivers();

	vis.conn.subscribe([oidPitstops]);
	vis.conn._socket.on("stateChange", function (id, state) {
		if (id === oidPitstops && $("#" + widgetID).length) {
			loadDrivers();
		}
	});
};
