import { registerAppServiceWorker } from "./appServiceWorker";
import { requestVpsApi } from "./vpsApiClient";

export const PUSH_TOPIC_OPTIONS = [
	{ key: "mapa", label: "Mapa O.S" },
	{ key: "match", label: "Match" },
	{ key: "metas", label: "Metas" },
	{ key: "comunicados", label: "Comunicados" },
	{ key: "tentativas", label: "Tentativas" },
];

const PUSH_STORAGE_KEY = "retiradas_push_preferences_v1";
const DEFAULT_TOPICS = { mapa: true, match: true, metas: true, comunicados: true, tentativas: true };

function normalizeTopics(topics = {}) {
	return PUSH_TOPIC_OPTIONS.reduce((acc, item) => {
		acc[item.key] = topics?.[item.key] === true;
		return acc;
	}, {});
}

function canUseNotificationApi() {
	return typeof window !== "undefined" && "Notification" in window;
}

export function isAndroidAppClient() {
	if (typeof window === "undefined") return false;
	return (
		window.sessionStorage.getItem("retiradas-client-mode") === "android" ||
		window.localStorage.getItem("retiradas-client-mode") === "android" ||
		new URLSearchParams(window.location.search).get("source") === "android"
	);
}

export function openAndroidNotificationSettings() {
	if (!isAndroidAppClient()) return false;
	window.location.href = "retiradas://notification-settings";
	return true;
}

function persistPushPreferences(value) {
	if (typeof window !== "undefined") window.localStorage.setItem(PUSH_STORAGE_KEY, JSON.stringify(value));
}

export function loadSavedPushPreferences() {
	if (typeof window === "undefined") return { enabled: false, topics: { ...DEFAULT_TOPICS }, token: "" };
	try {
		const raw = window.localStorage.getItem(PUSH_STORAGE_KEY);
		if (!raw) return { enabled: false, topics: { ...DEFAULT_TOPICS }, token: "" };
		const parsed = JSON.parse(raw);
		return {
			enabled: parsed?.enabled === true,
			topics: normalizeTopics({ ...DEFAULT_TOPICS, ...(parsed?.topics || {}) }),
			token: typeof parsed?.token === "string" ? parsed.token : "",
		};
	} catch {
		return { enabled: false, topics: { ...DEFAULT_TOPICS }, token: "" };
	}
}

function urlBase64ToUint8Array(value) {
	const padding = "=".repeat((4 - (value.length % 4)) % 4);
	const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = window.atob(base64);
	return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export async function getPushSupportState() {
	const hasServiceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;
	const hasPushManager = typeof window !== "undefined" && "PushManager" in window;
	let config = { enabled: false, publicKey: "" };
	let subscribed = false;
	if (hasServiceWorker && hasPushManager) {
		config = await requestVpsApi("/push/config").catch(() => config);
		const registration = await registerAppServiceWorker();
		subscribed = Boolean(await registration?.pushManager?.getSubscription());
	}
	return {
		supported: hasServiceWorker && hasPushManager,
		hasNotificationApi: canUseNotificationApi(),
		permission: canUseNotificationApi() ? Notification.permission : "denied",
		hasVapidKey: Boolean(config.publicKey),
		vapidKeyValid: Boolean(config.publicKey),
		migratedToVps: config.enabled === true,
		subscribed,
	};
}

export async function enablePushNotifications(topics = DEFAULT_TOPICS) {
	if (!canUseNotificationApi()) throw new Error("Este dispositivo nao suporta notificacoes.");
	const permission = await Notification.requestPermission();
	if (permission !== "granted") throw new Error("Permissao de notificacao nao concedida.");
	return ensurePushNotifications(topics);
}

export async function ensurePushNotifications(topics = DEFAULT_TOPICS) {
	if (!canUseNotificationApi() || Notification.permission !== "granted") {
		throw new Error("Permissao de notificacao nao concedida.");
	}
	const config = await requestVpsApi("/push/config");
	const registration = await registerAppServiceWorker();
	if (!registration?.pushManager) throw new Error("Push nao suportado neste navegador.");
	let subscription = await registration.pushManager.getSubscription();
	if (!subscription) {
		subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(config.publicKey),
		});
	}
	const normalized = normalizeTopics(topics);
	await requestVpsApi("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: subscription.toJSON(), topics: normalized }) });
	persistPushPreferences({ enabled: true, topics: normalized, token: subscription.endpoint });
	return { subscription, topics: normalized };
}

export async function disablePushNotifications() {
	const registration = await registerAppServiceWorker();
	const subscription = await registration?.pushManager?.getSubscription();
	if (subscription) {
		await requestVpsApi("/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => {});
		await subscription.unsubscribe().catch(() => {});
	}
	persistPushPreferences({ enabled: false, topics: { ...DEFAULT_TOPICS }, token: "" });
}

export async function updatePushTopics(topics) {
	const saved = loadSavedPushPreferences();
	const normalized = normalizeTopics(topics);
	persistPushPreferences({ enabled: saved.enabled === true, topics: normalized, token: saved.token || "" });
	if (saved.enabled) await syncSavedPushSubscription(normalized);
	return { token: saved.token || "", topics: normalized };
}

export async function syncSavedPushSubscription(topicsOverride = null) {
	if (!canUseNotificationApi() || Notification.permission !== "granted") return null;
	const registration = await registerAppServiceWorker();
	const subscription = await registration?.pushManager?.getSubscription();
	if (!subscription) return null;
	const saved = loadSavedPushPreferences();
	const topics = normalizeTopics(topicsOverride || saved.topics || DEFAULT_TOPICS);
	await requestVpsApi("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: subscription.toJSON(), topics }) });
	persistPushPreferences({ ...saved, enabled: true, topics, token: subscription.endpoint });
	return subscription;
}

export async function bindForegroundPushNotifications() {
	return registerAppServiceWorker();
}

export async function recordNotificationOpen(notificationId, channel = "IN_APP") {
	if (!notificationId) return null;
	return requestVpsApi("/push/events/open", { method: "POST", body: JSON.stringify({ notificationId, channel }) });
}

export async function fetchPushAdminOverview() {
	return requestVpsApi("/push/overview").catch(() => ({ total: 0, active: 0, users: 0, recent: [] }));
}

export async function fetchPushAdminRecipients(params = {}) {
	const query = new URLSearchParams();
	if (params.search) query.set("search", params.search);
	if (params.role) query.set("role", params.role);
	query.set("limit", String(params.limit || 500));
	return requestVpsApi(`/push/admin/recipients?${query.toString()}`);
}

export async function fetchPushAdminCampaigns(params = {}) {
	const query = new URLSearchParams({
		page: String(params.page || 1),
		limit: String(params.limit || 20),
	});
	return requestVpsApi(`/push/admin/campaigns?${query.toString()}`);
}

export async function sendAdminPushNotification(payload) {
	return requestVpsApi("/push/send", { method: "POST", body: JSON.stringify(payload || {}) });
}
