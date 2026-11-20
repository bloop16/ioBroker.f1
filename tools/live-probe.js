/*
 * Live probe for F1 SignalR Core: connects like the adapter does, subscribes and
 * feeds every message through the built adapter's handleWsMessage with stubbed states.
 * Usage: node tools/live-probe.js [seconds=60]
 * Requires `npm run build` first. Dev tool only, not shipped (see package.json "files").
 */
const Module = require("module");
const path = require("path");
const axios = require("axios");
const WebSocket = require("ws");

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
	if (id === "@iobroker/adapter-core") {
		return {
			Adapter: class {
				on() {}
			},
		};
	}
	return origRequire.apply(this, arguments);
};

const seconds = Number(process.argv[2] || 60);
const adapter = require(path.join(__dirname, "..", "build", "main.js"))({});
const states = {};
const counts = {};
adapter.setStateAsync = async (id, v) => {
	states[id] = v.val;
};
adapter.getStateAsync = async id => ({ val: states[id] });
adapter.log = {
	info: m => console.log("[info]", m),
	warn: m => console.log("[warn]", m),
	debug: m => process.env.PROBE_DEBUG && console.log("[debug]", m),
};
adapter.setInterval = () => 0;
adapter.clearInterval = () => {};
adapter.setTimeout = () => 0;
adapter.clearTimeout = () => {};
adapter.handleSessionEnded = async r => console.log("[probe] session ended:", r);
const origHandle = adapter.handleStreamData.bind(adapter);
adapter.handleStreamData = async (s, d) => {
	counts[s] = (counts[s] || 0) + 1;
	return origHandle(s, d);
};

(async () => {
	const base = "https://livetiming.formula1.com";
	const opt = await axios.options(`${base}/signalrcore/negotiate?negotiateVersion=1`, { validateStatus: () => true });
	const cookie = []
		.concat(opt.headers["set-cookie"] || [])
		.map(v => /AWSALBCORS=([^;]+)/.exec(v)?.[1])
		.find(Boolean);
	const headers = cookie ? { Cookie: `AWSALBCORS=${cookie}` } : {};
	const neg = await axios.post(`${base}/signalrcore/negotiate?negotiateVersion=1`, null, { headers });
	// ws ignores HTTPS_PROXY; pass an agent explicitly when running behind a proxy (e.g. cloud sandbox)
	const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
	const agent = proxy ? new (require("https-proxy-agent").HttpsProxyAgent)(proxy) : undefined;
	const ws = new WebSocket(
		`wss://livetiming.formula1.com/signalrcore?id=${encodeURIComponent(neg.data.connectionToken)}`,
		{ headers, agent },
	);
	adapter.ws = ws;
	const types = {};
	ws.on("open", () => ws.send(`${JSON.stringify({ protocol: "json", version: 1 })}\x1e`));
	ws.on("message", raw => {
		const str = raw.toString("utf8");
		for (const c of str.split("\x1e").filter(Boolean)) {
			try {
				const p = JSON.parse(c);
				const t = p.type ?? "handshake";
				types[t] = (types[t] || 0) + 1;
				if (p.type === 3) {
					console.log("[probe] completion:", JSON.stringify(p).slice(0, 400));
				}
			} catch {
				/* ignore */
			}
		}
		void adapter.handleWsMessage(str);
	});
	ws.on("close", (code, reason) => console.log("[probe] closed", code, String(reason)));
	ws.on("error", e => console.log("[probe] error", e.message));
	setTimeout(() => {
		console.log("[probe] message types:", types);
		console.log("[probe] streams:", counts);
		const keys = [
			"live.session_name",
			"live.session_status",
			"live.session_part",
			"live.time_remaining",
			"live.time_elapsed",
			"live.track_status",
			"live.laps_current",
		];
		for (const k of keys) {
			console.log(`[probe] ${k} =`, states[k]);
		}
		ws.close();
		process.exit(0);
	}, seconds * 1000);
})().catch(e => {
	console.error("[probe] failed:", e.message);
	process.exit(1);
});
