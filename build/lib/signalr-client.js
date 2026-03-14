"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalRClient = void 0;
const events_1 = require("events");
const axios_1 = __importDefault(require("axios"));
const zlib = __importStar(require("zlib"));
const ws_1 = __importDefault(require("ws"));
const BASE_URL = "https://livetiming.formula1.com/signalr";
const CONNECTION_DATA = JSON.stringify([{ name: "streaming" }]);
const SUBSCRIPTIONS = [
    "RaceControlMessages",
    "TrackStatus",
    "SessionStatus",
    "WeatherData",
    "LapCount",
    "SessionInfo",
    "SessionData",
    "Heartbeat",
    "ExtrapolatedClock",
    "TimingData",
    "DriverList",
    "TimingAppData",
    "TopThree",
    "TyreStintSeries",
    "TeamRadio",
    "PitStopSeries",
    "ChampionshipPrediction",
    "DriverRaceInfo",
];
const RECONNECT_DELAYS = [2000, 4000, 8000, 16000, 30000];
const HEARTBEAT_TIMEOUT_MS = 45_000;
const RENEWAL_INTERVAL_MS = 5 * 60_000;
class SignalRClient extends events_1.EventEmitter {
    log;
    ws;
    heartbeatTimer;
    renewalTimer;
    reconnectTimer;
    reconnectAttempts = 0;
    _connected = false;
    _destroyed = false;
    callId = 1;
    constructor(log) {
        super();
        this.log = log;
    }
    isConnected() {
        return this._connected;
    }
    async connect() {
        if (this._connected || this._destroyed)
            return;
        this.log.info("Connecting to F1 live timing SignalR...");
        try {
            // Step 1: Negotiate — get connection token
            const negotiateRes = await axios_1.default.get(`${BASE_URL}/negotiate`, {
                params: { clientProtocol: "1.5", connectionData: CONNECTION_DATA },
                headers: { "User-Agent": "BestHTTP", "Accept-Encoding": "gzip, deflate, br" },
                timeout: 10_000,
            });
            const token = negotiateRes.data.ConnectionToken;
            const encodedToken = encodeURIComponent(token);
            const qs = `transport=webSockets&clientProtocol=1.5&connectionToken=${encodedToken}&connectionData=${encodeURIComponent(CONNECTION_DATA)}`;
            // Step 2: Start — required before WebSocket will send data
            await axios_1.default.get(`${BASE_URL}/start?${qs}`, {
                headers: { "User-Agent": "BestHTTP", "Accept-Encoding": "gzip, deflate, br" },
                timeout: 10_000,
            });
            // Step 3: Open WebSocket
            const wsUrl = `wss://livetiming.formula1.com/signalr/connect?${qs}`;
            this.ws = new ws_1.default(wsUrl, {
                headers: { "User-Agent": "BestHTTP", "Accept-Encoding": "gzip, deflate, br" },
            });
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 15_000);
                this.ws.once("open", () => {
                    clearTimeout(timeout);
                    resolve();
                });
                this.ws.once("error", err => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });
            this._connected = true;
            this.reconnectAttempts = 0;
            this.log.info("F1 live timing connected");
            this.emit("connected");
            this.ws.on("message", data => this.onMessage(data));
            this.ws.on("close", () => this.onDisconnected());
            this.ws.on("error", err => {
                this.log.warn(`SignalR WS error: ${err.message}`);
                this.emit("error", err);
            });
            // Step 4: Subscribe to all topics
            this.sendSubscribe();
            // Heartbeat watchdog
            this.resetHeartbeatTimer();
            // Renew subscription every 5 minutes (Azure SignalR 20-min timeout)
            this.renewalTimer = setInterval(() => {
                if (this._connected) {
                    this.log.debug("Renewing SignalR subscription");
                    this.sendSubscribe();
                }
            }, RENEWAL_INTERVAL_MS);
        }
        catch (err) {
            this.log.error(`Failed to connect to F1 live timing: ${err.message}`);
            this._connected = false;
            this.scheduleReconnect();
        }
    }
    sendSubscribe() {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN)
            return;
        this.ws.send(JSON.stringify({ H: "streaming", M: "Subscribe", A: [SUBSCRIPTIONS], I: this.callId++ }));
    }
    onMessage(raw) {
        try {
            const msg = JSON.parse(raw.toString());
            // Reset watchdog on any message
            this.resetHeartbeatTimer();
            if (!Array.isArray(msg.M))
                return;
            for (const hubMsg of msg.M) {
                if (hubMsg.H !== "streaming" || hubMsg.M !== "feed" || !Array.isArray(hubMsg.A))
                    continue;
                const [topic, payload, timestamp] = hubMsg.A;
                const data = this.decompressPayload(payload);
                this.emit("message", topic, data, timestamp ?? new Date().toISOString());
            }
        }
        catch {
            // Ignore malformed frames
        }
    }
    decompressPayload(payload) {
        if (typeof payload !== "string")
            return payload;
        // Try base64 + zlib.inflateRaw (compressed diff payloads)
        try {
            const buf = Buffer.from(payload, "base64");
            const decompressed = zlib.inflateRawSync(buf);
            return JSON.parse(decompressed.toString("utf8"));
        }
        catch {
            // Plain JSON string
            try {
                return JSON.parse(payload);
            }
            catch {
                return payload;
            }
        }
    }
    resetHeartbeatTimer() {
        if (this.heartbeatTimer)
            clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = setTimeout(() => {
            this.log.warn("SignalR heartbeat timeout — reconnecting");
            this.disconnect();
            if (!this._destroyed)
                this.scheduleReconnect();
        }, HEARTBEAT_TIMEOUT_MS);
    }
    onDisconnected() {
        if (!this._connected)
            return;
        this._connected = false;
        this.clearTimers();
        this.log.info("Disconnected from F1 live timing");
        this.emit("disconnected");
        if (!this._destroyed)
            this.scheduleReconnect();
    }
    scheduleReconnect() {
        if (this._destroyed)
            return;
        const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS.length - 1)];
        this.reconnectAttempts++;
        this.log.debug(`SignalR reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);
        this.reconnectTimer = setTimeout(() => {
            if (!this._destroyed)
                this.connect().catch(() => { });
        }, delay);
    }
    disconnect() {
        this._connected = false;
        this.clearTimers();
        if (this.ws) {
            this.ws.removeAllListeners();
            try {
                this.ws.close();
            }
            catch {
                /* ignore */
            }
            this.ws = undefined;
        }
    }
    destroy() {
        this._destroyed = true;
        this.disconnect();
    }
    clearTimers() {
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
        if (this.renewalTimer) {
            clearInterval(this.renewalTimer);
            this.renewalTimer = undefined;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
    }
}
exports.SignalRClient = SignalRClient;
//# sourceMappingURL=signalr-client.js.map