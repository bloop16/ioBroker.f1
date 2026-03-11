/*
    ioBroker.f1 - Race Countdown Widget
    VIS1 Widget Implementation
*/

// Add to global vis.binds
vis.binds["f1-race-countdown"] = {
    version: "0.1.0",
    showVersion: function () {
        if (vis.binds["f1-race-countdown"].version) {
            console.log("Version f1-race-countdown: " + vis.binds["f1-race-countdown"].version);
            vis.binds["f1-race-countdown"].version = null;
        }
    },
    
    createWidget: function (widgetID, view, data, style) {
        var $div = $("#" + widgetID);
        
        // If nothing defined, exit
        if (!data.circuit_oid) return;
        
        // Subscribe to state changes
        function updateWidget() {
            // Get circuit name
            if (data.circuit_oid) {
                vis.states.bind(data.circuit_oid + ".val", function (e, newVal, oldVal) {
                    $div.find(".f1-countdown-circuit-name").text(newVal || "Loading...");
                });
            }
            
            // Get country & location
            if (data.country_oid && data.location_oid) {
                vis.states.bind(data.country_oid + ".val", function (e, countryVal) {
                    vis.states.bind(data.location_oid + ".val", function (e, locationVal) {
                        var locationText = (countryVal || "") + " • " + (locationVal || "");
                        $div.find(".f1-countdown-location-text").text(locationText);
                    });
                });
            }
            
            // Get countdown days
            if (data.countdown_oid) {
                vis.states.bind(data.countdown_oid + ".val", function (e, newVal) {
                    var days = parseInt(newVal) || 0;
                    $div.find(".f1-countdown-days").text(days);
                });
            }
            
            // Get date
            if (data.date_oid) {
                vis.states.bind(data.date_oid + ".val", function (e, newVal) {
                    if (newVal) {
                        var date = new Date(newVal);
                        var formatted = date.toLocaleString("en-US", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "UTC",
                            timeZoneName: "short"
                        });
                        $div.find(".f1-countdown-date-text").text("📅 " + formatted);
                    }
                });
            }
        }
        
        updateWidget();
        
        // Return data for VIS
        return {
            wid: widgetID,
            view: view,
            data: data,
            style: style
        };
    }
};

vis.binds["f1-race-countdown"].showVersion();
