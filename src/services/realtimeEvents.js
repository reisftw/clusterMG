import { getApiBaseUrl } from "./vpsApiClient";

const UPDATE_EVENT_NAME = "retiradas-realtime-update";

let source = null;
let subscribers = 0;

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

function ensureSource() {
	if (typeof window === "undefined" || source) return;
	if (typeof window.EventSource !== "function") return;

	source = new window.EventSource(`${getApiBaseUrl()}/events`);
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

function closeSourceIfIdle() {
	if (subscribers > 0 || !source) return;
	source.close();
	source = null;
}

export function subscribeRealtimeTopics(topics, callback, options = {}) {
	if (typeof window === "undefined") return () => {};

	const topicSet = new Set(Array.isArray(topics) ? topics : [topics]);
	const debounceMs = Math.max(0, Number(options.debounceMs || 0));
	let debounceTimer = null;
	let lastDetail = null;
	subscribers += 1;
	ensureSource();

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
		subscribers = Math.max(0, subscribers - 1);
		closeSourceIfIdle();
	};
}
