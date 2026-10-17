import { getApiBaseUrl } from "./vpsApiClient";

const UPDATE_EVENT_NAME = "retiradas-realtime-update";

const sources = {
	internal: null,
	public: null,
};
const subscribers = {
	internal: 0,
	public: 0,
};

function emitLocalUpdate(detail) {
	window.dispatchEvent(new CustomEvent(UPDATE_EVENT_NAME, { detail }));
}

export function emitRealtimeUpdate(topic, payload = {}) {
	if (typeof window === "undefined") return;
	emitLocalUpdate({
		topic,
		...payload,
		emittedAt: new Date().toISOString(),
		local: true,
	});
}

function ensureSource(stream) {
	if (typeof window === "undefined" || sources[stream]) return;
	if (typeof window.EventSource !== "function") return;

	const suffix = stream === "public" ? "?public=1" : "";
	const source = new window.EventSource(`${getApiBaseUrl()}/events${suffix}`);
	sources[stream] = source;
	source.addEventListener("retiradas-update", (event) => {
		try {
			emitLocalUpdate(JSON.parse(event.data || "{}"));
		} catch {
			emitLocalUpdate({ topic: "unknown" });
		}
	});
	source.onerror = () => {
		// EventSource reconnects automatically. Keep the instance open.
	};
}

function closeSourceIfIdle(stream) {
	if (subscribers[stream] > 0 || !sources[stream]) return;
	sources[stream].close();
	sources[stream] = null;
}

export function subscribeRealtimeTopics(topics, callback, options = {}) {
	if (typeof window === "undefined") return () => {};

	const topicSet = new Set(Array.isArray(topics) ? topics : [topics]);
	const stream = options.public ? "public" : "internal";
	const debounceMs = Math.max(0, Number(options.debounceMs || 0));
	let debounceTimer = null;
	let lastDetail = null;
	subscribers[stream] += 1;
	ensureSource(stream);

	const handler = (event) => {
		const detail = event.detail || {};
		if (!topicSet.has(detail.topic)) return;
		if (!debounceMs) {
			callback(detail);
			return;
		}

		lastDetail = detail;
		if (debounceTimer) window.clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(() => {
			debounceTimer = null;
			callback(lastDetail);
		}, debounceMs);
	};

	window.addEventListener(UPDATE_EVENT_NAME, handler);
	return () => {
		if (debounceTimer) window.clearTimeout(debounceTimer);
		window.removeEventListener(UPDATE_EVENT_NAME, handler);
		subscribers[stream] = Math.max(0, subscribers[stream] - 1);
		closeSourceIfIdle(stream);
	};
}
