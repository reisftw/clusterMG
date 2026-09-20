import {
	fetchFinanPushVapidPublicKey,
	subscribeFinanPush,
	unsubscribeFinanPush,
} from "../api/finanApi";

// applicationServerKey do Push API espera um Uint8Array, nao a string
// base64url que a chave VAPID publica vem no formato padrao.
function urlBase64ToUint8Array(base64String) {
	const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
	const rawData = window.atob(base64);
	return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isPushSupported() {
	return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getExistingPushSubscription() {
	if (!isPushSupported()) return null;
	const registration = await navigator.serviceWorker.ready;
	return registration.pushManager.getSubscription();
}

/** Pede permissao (se preciso), inscreve o navegador e registra no backend. */
export async function enableFinanPush() {
	if (!isPushSupported()) {
		throw new Error("Este navegador não suporta notificações push.");
	}
	const { enabled, publicKey } = await fetchFinanPushVapidPublicKey();
	if (!enabled || !publicKey) {
		throw new Error("Notificações push ainda não foram configuradas pelo administrador.");
	}

	const permission = await Notification.requestPermission();
	if (permission !== "granted") {
		throw new Error("Permissão de notificação negada.");
	}

	const registration = await navigator.serviceWorker.ready;
	let subscription = await registration.pushManager.getSubscription();
	if (!subscription) {
		subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicKey),
		});
	}
	await subscribeFinanPush(subscription.toJSON());
	return subscription;
}

/** Cancela a inscricao no navegador e avisa o backend pra parar de mandar push pra ela. */
export async function disableFinanPush() {
	const subscription = await getExistingPushSubscription();
	if (!subscription) return;
	const endpoint = subscription.endpoint;
	await subscription.unsubscribe().catch(() => {});
	await unsubscribeFinanPush(endpoint).catch(() => {});
}
