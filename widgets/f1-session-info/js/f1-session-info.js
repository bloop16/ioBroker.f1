/*
    ioBroker.f1 - Session Info Widget
    Part of vis.binds["f1"]
*/

vis.binds["f1"].createSessionWidget = function (el, view, data, style) {
	var $div = $(el);
	var widgetID = el.id;

	var oidSession = "f1.0.live_session.json";
	var oidRaceControl = "f1.0.race_control.latest_message";

	var flagEmoji = {
		green: "🟢",
		yellow: "🟡",
		red: "🔴",
		blue: "🔵",
		white: "⚪",
		allclear: "🟢",
		scdeployed: "🟡",
		vsc: "🟡",
		sc: "🟡",
	};

	var sessionTypeIcons = {
		Practice: "🏁",
		Qualifying: "⏱️",
		Sprint: "⚡",
		Race: "🏆",
	};

	function applySession(sessionData) {
		var $content = $div.find(".f1-session-content");
		$content.empty();

		if (!sessionData) {
			$content.html('<div class="f1-session-empty">No session data available</div>');
			return;
		}

		// Session Type
		var typeIcon = sessionTypeIcons[sessionData.session_type] || "🏁";
		var $type = $('<div class="f1-session-section"></div>');
		$type.append(
			'<div class="f1-session-type">' +
				'<span class="f1-session-type-icon">' +
				typeIcon +
				"</span>" +
				"<span>" +
				(sessionData.session_type || "Session") +
				"</span>" +
				"</div>",
		);

		// Status badge
		var status = (sessionData.status || "no_session").toLowerCase().replace("_", "-");
		var statusText = sessionData.status || "NO SESSION";
		$type.append('<div class="f1-session-status ' + status + '">' + statusText.replace("_", " ") + "</div>");
		$content.append($type);

		// Track Status
		if (sessionData.track_status) {
			var trackStatus = sessionData.track_status.toLowerCase();
			var flagIcon = flagEmoji[trackStatus] || "⚪";
			var flagClass =
				trackStatus === "allclear"
					? "green"
					: trackStatus.includes("sc") || trackStatus === "yellow"
						? "yellow"
						: trackStatus === "red"
							? "red"
							: "";

			var $track = $('<div class="f1-session-section"></div>');
			$track.append(
				'<div class="f1-session-track-status">' +
					'<span class="f1-session-flag">' +
					flagIcon +
					"</span>" +
					'<span class="f1-session-flag-text ' +
					flagClass +
					'">' +
					sessionData.track_status
						.replace(/([A-Z])/g, " $1")
						.trim()
						.toUpperCase() +
					"</span>" +
					"</div>",
			);
			$content.append($track);
		}

		// Weather
		if (sessionData.weather) {
			var w = sessionData.weather;
			var $weather = $('<div class="f1-session-section"></div>');
			$weather.append('<div class="f1-session-weather"></div>');
			var $grid = $weather.find(".f1-session-weather");

			if (w.air_temperature != null) {
				$grid.append(
					'<div class="f1-session-weather-item">' +
						'<div class="f1-session-weather-label">🌡️ Air Temp</div>' +
						'<div class="f1-session-weather-value">' +
						w.air_temperature +
						"°C</div>" +
						"</div>",
				);
			}
			if (w.track_temperature != null) {
				$grid.append(
					'<div class="f1-session-weather-item">' +
						'<div class="f1-session-weather-label">🏁 Track Temp</div>' +
						'<div class="f1-session-weather-value">' +
						w.track_temperature +
						"°C</div>" +
						"</div>",
				);
			}
			if (w.wind_speed != null) {
				var windText = w.wind_speed + " km/h";
				if (w.wind_direction) windText += " " + w.wind_direction;
				$grid.append(
					'<div class="f1-session-weather-item">' +
						'<div class="f1-session-weather-label">💨 Wind</div>' +
						'<div class="f1-session-weather-value">' +
						windText +
						"</div>" +
						"</div>",
				);
			}
			if (w.humidity != null) {
				$grid.append(
					'<div class="f1-session-weather-item">' +
						'<div class="f1-session-weather-label">💧 Humidity</div>' +
						'<div class="f1-session-weather-value">' +
						w.humidity +
						"%</div>" +
						"</div>",
				);
			}
			$content.append($weather);
		}
	}

	function applyRaceControl(message) {
		var $content = $div.find(".f1-session-content");
		var $existing = $content.find(".f1-session-message");

		if ($existing.length) {
			$existing.remove();
		}

		if (message) {
			var $msg = $(
				'<div class="f1-session-section">' +
					'<div class="f1-session-message">' +
					'<span class="f1-session-message-icon">📻</span>' +
					'<span class="f1-session-message-text">' +
					message +
					"</span>" +
					"</div>" +
					"</div>",
			);
			$content.append($msg);
		}
	}

	function loadSession() {
		vis.conn.getStates(oidSession, function (err, states) {
			if (!err && states && states[oidSession] && states[oidSession].val) {
				try {
					var session =
						typeof states[oidSession].val === "string"
							? JSON.parse(states[oidSession].val)
							: states[oidSession].val;
					applySession(session);
				} catch (e) {
					console.error("F1 Session: parse error", e);
				}
			}
		});
	}

	function loadRaceControl() {
		vis.conn.getStates(oidRaceControl, function (err, states) {
			if (!err && states && states[oidRaceControl]) {
				applyRaceControl(states[oidRaceControl].val);
			}
		});
	}

	// Initial load
	loadSession();
	loadRaceControl();

	// Subscribe to updates
	vis.conn.subscribe([oidSession, oidRaceControl]);
	vis.conn._socket.on("stateChange", function (id, state) {
		if ($("#" + widgetID).length === 0) return;

		if (id === oidSession) {
			try {
				var session =
					state && state.val ? (typeof state.val === "string" ? JSON.parse(state.val) : state.val) : null;
				applySession(session);
			} catch (e) {
				console.error("F1 Session: update error", e);
			}
		} else if (id === oidRaceControl) {
			applyRaceControl(state ? state.val : null);
		}
	});
};
