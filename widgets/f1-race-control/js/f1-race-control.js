/*
    ioBroker.f1 - Race Control Card
    Part of vis.binds["f1"]
*/

vis.binds["f1"].createRaceControlWidget = function (el, view, data, style) {
    var $div = $(el);
    var widgetID = el.id;

    var oidMessages = "f1.0.race_control.messages";

    var flagEmojis = {
        "green": "🟢",
        "yellow": "🟡",
        "red": "🔴",
        "blue": "🔵",
        "white": "⚪",
        "black": "⚫",
        "chequered": "🏁"
    };

    function detectFlag(message) {
        var lower = message.toLowerCase();
        if (lower.includes("green flag") || lower.includes("all clear")) return "green-flag";
        if (lower.includes("yellow flag") || lower.includes("safety car") || lower.includes("vsc")) return "yellow-flag";
        if (lower.includes("red flag")) return "red-flag";
        if (lower.includes("blue flag")) return "blue-flag";
        if (lower.includes("white flag")) return "white-flag";
        return "";
    }

    function getFlagEmoji(message) {
        var lower = message.toLowerCase();
        if (lower.includes("green") || lower.includes("all clear")) return "🟢";
        if (lower.includes("yellow") || lower.includes("safety") || lower.includes("vsc")) return "🟡";
        if (lower.includes("red")) return "🔴";
        if (lower.includes("blue")) return "🔵";
        if (lower.includes("white")) return "⚪";
        if (lower.includes("black")) return "⚫";
        if (lower.includes("chequered") || lower.includes("checkered")) return "🏁";
        return "📻";
    }

    function formatTime(dateStr) {
        if (!dateStr) return "";
        try {
            var d = new Date(dateStr);
            var hours = String(d.getHours()).padStart(2, '0');
            var mins = String(d.getMinutes()).padStart(2, '0');
            var secs = String(d.getSeconds()).padStart(2, '0');
            return hours + ":" + mins + ":" + secs;
        } catch (e) {
            return "";
        }
    }

    function applyMessages(messagesData) {
        var $content = $div.find(".f1-race-control-content");
        $content.empty();

        if (!messagesData || !messagesData.length) {
            $content.html('<div class="f1-race-control-empty">No race control messages</div>');
            return;
        }

        // Sort by date (newest first)
        var sorted = messagesData.slice().sort(function (a, b) {
            return new Date(b.date) - new Date(a.date);
        });

        sorted.forEach(function (msg) {
            var flagClass = detectFlag(msg.message || "");
            var flagEmoji = getFlagEmoji(msg.message || "");
            var timeStr = formatTime(msg.date);

            var $msg = $(
                '<div class="f1-race-control-message ' + flagClass + '">' +
                '<span class="f1-race-control-message-flag">' + flagEmoji + '</span>' +
                '<div class="f1-race-control-message-content">' +
                '<div class="f1-race-control-message-text">' + (msg.message || '') + '</div>' +
                '<div class="f1-race-control-message-time">' + timeStr + '</div>' +
                '</div>' +
                '</div>'
            );

            $content.append($msg);
        });
    }

    function loadMessages() {
        vis.conn.getStates(oidMessages, function (err, states) {
            if (!err && states && states[oidMessages] && states[oidMessages].val) {
                try {
                    var messages = typeof states[oidMessages].val === "string"
                        ? JSON.parse(states[oidMessages].val)
                        : states[oidMessages].val;
                    applyMessages(messages);
                } catch (e) {
                    console.error("F1 Race Control: parse error", e);
                }
            }
        });
    }

    loadMessages();

    vis.conn.subscribe([oidMessages]);
    vis.conn._socket.on("stateChange", function (id, state) {
        if (id === oidMessages && $("#" + widgetID).length) {
            try {
                var messages = state && state.val
                    ? (typeof state.val === "string" ? JSON.parse(state.val) : state.val)
                    : null;
                applyMessages(messages);
            } catch (e) {
                console.error("F1 Race Control: update error", e);
            }
        }
    });
};
