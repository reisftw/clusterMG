import { requestVpsApi } from "./vpsApiClient";

export const PUSH_TOPIC_OPTIONS = [
	{ key: "mapa", label: "Mapa O.S" },
	{ key: "match", label: "Match" },
	{ key: "metas", label: "Metas" },
	{ key: "comunicados", label: "Comunicados" },
];

const PUSH_STORAGE_KEY = "retiradas_push_preferences_v1";
const DEFAULT_TOPICS = {
	mapa: true,
	match: true,
	metas: true,
	comunicados: true,
};

function normalizeTopics(topics = {}) {
	return PUSH_TOPIC_OPTIONS.reduce((acc, item) => {
		acc[item.key] = topics?.[item.key] === true;
		return acc;
	}, {});
}

function canUseNotificationApi() {
	return typeof window !== "undefined" && "Notification" in window;
}

function persistPushPreferences(value) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(PUSH_STORAGE_KEY, JSON.stringify(value));
}

export function loadSavedPushPreferences() {
	if (typeof window === "undefined") {
		return { enabled: false, topics: { ...DEFAULT_TOPICS }, token: "" };
	}

	try {
		const raw = window.localStorage.getItem(PUSH_STORAGE_KEY);
		if (!raw)
			return { enabled: false, topics: { ...DEFAULT_TOPICS }, token: "" };
		const parsed = JSON.parse(raw);
		return {
			enabled: parsed?.enabled === true,
			topics: normalizeTopics(parsed?.topics || DEFAULT_TOPICS),
			token: typeof parsed?.token === "string" ? parsed.token : "",
		};
	} catch {
		return { enabled: false, topics: { ...DEFAULT_TOPICS }, token: "" };
	}
}

export async function getPushSupportState() {
	return {
		supported: false,
		hasNotificationApi: canUseNotificationApi(),
		permission: canUseNotificationApi() ? Notification.permission : "denied",
		hasVapidKey: false,
		vapidKeyValid: false,
		migratedToVps: false,
	};
}

export async function enablePushNotifications() {
	throw new Error("Push ainda nao foi migrado para a VPS.");
}

export async function disablePushNotifications() {
	persistPushPreferences({
		enabled: false,
		topics: { ...DEFAULT_TOPICS },
		token: "",
	});
}

export async function updatePushTopics(topics) {
	const saved = loadSavedPushPreferences();
	const normalized = normalizeTopics(topics);
	persistPushPreferences({
		enabled: false,
		topics: normalized,
		token: saved.token || "",
	});
	return { token: saved.token || "", topics: normalized };
}

export async function syncSavedPushSubscription() {
	return null;
}

export async function bindForegroundPushNotifications() {
	return null;
}

export async function fetchPushAdminOverview() {
	return requestVpsApi("/push/overview").catch(() => ({
		total: 0,
		active: 0,
		topics: {},
		recent: [],
	}));
}

export async function sendAdminPushNotification(payload) {
	return requestVpsApi("/push/send", {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}
