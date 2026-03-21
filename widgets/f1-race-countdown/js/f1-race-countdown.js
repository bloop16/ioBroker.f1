/*
    ioBroker.f1 - Race Countdown Widget
    VIS1 Widget Implementation
*/

vis.binds["f1"] = {
	version: "0.1.0",
	showVersion: function () {
		if (vis.binds["f1"].version) {
			console.log("Version f1: " + vis.binds["f1"].version);
			vis.binds["f1"].version = null;
		}
	},

	// el is the DOM element (passed by CanJS EJS element callback)
	createWidget: function (el, view, data, style) {
		var $div = $(el);
		var widgetID = el.id;
		var oid = "f1.0.next_race.json";

		function applyJson(jsonStr) {
			if (!jsonStr) return;
			var race;
			try {
				race = typeof jsonStr === "object" ? jsonStr : JSON.parse(jsonStr);
			} catch (e) {
				return;
			}

			$div.find(".f1-countdown-circuit-name").text(race.circuit_short_name || "–");
			$div.find(".f1-countdown-location-text").text(
				[race.country_name, race.location].filter(Boolean).join(" • ") || "–",
			);

			if (race.date_start) {
				var d = new Date(race.date_start);
				var days = Math.ceil((d - new Date()) / 86400000);
				$div.find(".f1-countdown-days").text(days > 0 ? days : 0);
				$div.find(".f1-countdown-date-text").text(
					"📅 " +
						d.toLocaleString(undefined, {
							year: "numeric",
							month: "2-digit",
							day: "2-digit",
							hour: "2-digit",
							minute: "2-digit",
							timeZoneName: "short",
						}),
				);
			}
		}

		// Get initial value via vis.conn (handles connection state properly)
		vis.conn.getStates(oid, function (err, states) {
			if (!err && states && states[oid]) {
				applyJson(states[oid].val);
			}
		});

		// Subscribe and listen for live updates
		vis.conn.subscribe([oid]);
		vis.conn._socket.on("stateChange", function (id, state) {
			if (id === oid && $("#" + widgetID).length) {
				applyJson(state ? state.val : null);
			}
		});
	},
};

vis.binds["f1"].showVersion();
