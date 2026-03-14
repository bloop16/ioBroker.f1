import { EventEmitter } from "events";
import axios from "axios";
import * as zlib from "zlib";
import WebSocket from "ws";

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

type AdapterLog = {
	info: (s: string) => void;
	debug: (s: string) => void;
	warn: (s: string) => void;
	error: (s: string) => void;
};

export class SignalRClient extends EventEmitter {
	private ws?: WebSocket;
	private heartbeatTimer?: NodeJS.Timeout;
	private renewalTimer?: NodeJS.Timeout;
	private reconnectTimer?: NodeJS.Timeout;
	private reconnectAttempts = 0;
	private _connected = false;
	private _destroyed = false;
	private callId = 1;

	constructor(private readonly log: AdapterLog) {
		super();
	}

	isConnected(): boolean {
		return this._connected;
	}

	async connect(): Promise<void> {
		if (this._connected || this._destroyed) return;
		this.log.info("Connecting to F1 live timing SignalR...");

		try {
			// Step 1: Negotiate — get connection token
			const negotiateRes = await axios.get<{ ConnectionToken: string }>(`${BASE_URL}/negotiate`, {
				params: { clientProtocol: "1.5", connectionData: CONNECTION_DATA },
				headers: { "User-Agent": "BestHTTP", "Accept-Encoding": "gzip, deflate, br" },
				timeout: 10_000,
			});

			const token = negotiateRes.data.ConnectionToken;
			const encodedToken = encodeURIComponent(token);
			const qs = `transport=webSockets&clientProtocol=1.5&connectionToken=${encodedToken}&connectionData=${encodeURIComponent(CONNECTION_DATA)}`;

			// Step 2: Start — required before WebSocket will send data
			await axios.get(`${BASE_URL}/start?${qs}`, {
				headers: { "User-Agent": "BestHTTP", "Accept-Encoding": "gzip, deflate, br" },
				timeout: 10_000,
			});

			// Step 3: Open WebSocket
			const wsUrl = `wss://livetiming.formula1.com/signalr/connect?${qs}`;
			this.ws = new WebSocket(wsUrl, {
				headers: { "User-Agent": "BestHTTP", "Accept-Encoding": "gzip, deflate, br" },
			});

			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 15_000);
				this.ws!.once("open", () => {
					clearTimeout(timeout);
					resolve();
				});
				this.ws!.once("error", err => {
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
		} catch (err) {
			this.log.error(`Failed to connect to F1 live timing: ${(err as Error).message}`);
			this._connected = false;
			this.scheduleReconnect();
		}
	}

	private sendSubscribe(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(JSON.stringify({ H: "streaming", M: "Subscribe", A: [SUBSCRIPTIONS], I: this.callId++ }));
	}

	private onMessage(raw: WebSocket.RawData): void {
		try {
			const msg = JSON.parse(raw.toString()) as { M?: Array<{ H: string; M: string; A: unknown[] }> };

			// Reset watchdog on any message
			this.resetHeartbeatTimer();

			if (!Array.isArray(msg.M)) return;

			for (const hubMsg of msg.M) {
				if (hubMsg.H !== "streaming" || hubMsg.M !== "feed" || !Array.isArray(hubMsg.A)) continue;

				const [topic, payload, timestamp] = hubMsg.A as [string, unknown, string | undefined];
				const data = this.decompressPayload(payload);
				this.emit("message", topic, data, timestamp ?? new Date().toISOString());
			}
		} catch {
			// Ignore malformed frames
		}
	}

	private decompressPayload(payload: unknown): unknown {
		if (typeof payload !== "string") return payload;

		// Try base64 + zlib.inflateRaw (compressed diff payloads)
		try {
			const buf = Buffer.from(payload, "base64");
			const decompressed = zlib.inflateRawSync(buf);
			return JSON.parse(decompressed.toString("utf8"));
		} catch {
			// Plain JSON string
			try {
				return JSON.parse(payload);
			} catch {
				return payload;
			}
		}
	}

	private resetHeartbeatTimer(): void {
		if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
		this.heartbeatTimer = setTimeout(() => {
			this.log.warn("SignalR heartbeat timeout — reconnecting");
			this.disconnect();
			if (!this._destroyed) this.scheduleReconnect();
		}, HEARTBEAT_TIMEOUT_MS);
	}

	private onDisconnected(): void {
		if (!this._connected) return;
		this._connected = false;
		this.clearTimers();
		this.log.info("Disconnected from F1 live timing");
		this.emit("disconnected");
		if (!this._destroyed) this.scheduleReconnect();
	}

	private scheduleReconnect(): void {
		if (this._destroyed) return;
		const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS.length - 1)];
		this.reconnectAttempts++;
		this.log.debug(`SignalR reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);
		this.reconnectTimer = setTimeout(() => {
			if (!this._destroyed) this.connect().catch(() => {});
		}, delay);
	}

	disconnect(): void {
		this._connected = false;
		this.clearTimers();
		if (this.ws) {
			this.ws.removeAllListeners();
			try {
				this.ws.close();
			} catch {
				/* ignore */
			}
			this.ws = undefined;
		}
	}

	destroy(): void {
		this._destroyed = true;
		this.disconnect();
	}

	private clearTimers(): void {
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
