vis.binds["f1"].createChampionshipDriversWidget = function (el, view, data, style) {
	var $div = $(el);
	var widgetID = el.id;

	var oid = "f1.0.standings.drivers";

	function applyDrivers(drivers) {
		var $content = $div.find(".f1-championship-drivers-content");
		$content.empty();

		if (!drivers || !drivers.length) {
			$content.html('<div class="f1-championship-drivers-empty">No standings available</div>');
			return;
		}

		var sorted = drivers.slice().sort(function (a, b) {
			return (a.position || 99) - (b.position || 99);
		});

		sorted.forEach(function (driver) {
			var teamColor = driver.team_colour ? "#" + driver.team_colour : "#666666";

			var $row = $('<div class="f1-championship-drivers-row"></div>');
			$row.append('<span class="f1-championship-drivers-position">' + (driver.position || "?") + "</span>");
			$row.append('<div class="f1-championship-drivers-team-bar" style="background:' + teamColor + '"></div>');

			var $info = $('<div class="f1-championship-drivers-info"></div>');
			$info.append(
				'<div class="f1-championship-drivers-name">' +
					(driver.full_name || driver.name_acronym || "#" + driver.driver_number) +
					"</div>",
			);
			$info.append('<div class="f1-championship-drivers-team">' + (driver.team_name || "") + "</div>");
			$row.append($info);

			$row.append('<span class="f1-championship-drivers-points">' + (driver.points || 0) + "</span>");

			$content.append($row);
		});
	}

	function loadDrivers() {
		vis.conn.getStates(oid, function (err, states) {
			if (!err && states && states[oid] && states[oid].val) {
				try {
					var drivers = typeof states[oid].val === "string" ? JSON.parse(states[oid].val) : states[oid].val;
					applyDrivers(drivers);
				} catch (e) {}
			}
		});
	}

	loadDrivers();

	vis.conn.subscribe([oid]);
	vis.conn._socket.on("stateChange", function (id, state) {
		if (id === oid && $("#" + widgetID).length) {
			try {
				var drivers =
					state && state.val ? (typeof state.val === "string" ? JSON.parse(state.val) : state.val) : null;
				applyDrivers(drivers);
			} catch (e) {}
		}
	});
};
