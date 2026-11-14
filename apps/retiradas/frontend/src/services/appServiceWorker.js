let serviceWorkerRegistrationPromise = null;
const APP_SERVICE_WORKER_VERSION = import.meta.env.VITE_APP_VERSION || "local";
const SERVICE_WORKER_CLIENT_KEY = "retiradas-sw-client-id";
const PWA_UPDATE_CONFIRMED_KEY = "retiradas-pwa-update-confirmed";
export const PWA_UPDATE_AVAILABLE_EVENT = "retiradas:pwa-update-available";

function buildServiceWorkerUrl() {
	const params = new URLSearchParams({
		v: APP_SERVICE_WORKER_VERSION,
	});

	return `/sw.js?${params.toString()}`;
}

function getServiceWorkerClientId() {
	try {
		const existing = window.localStorage.getItem(SERVICE_WORKER_CLIENT_KEY);
		if (existing) return existing;
		const generated =
			window.crypto?.randomUUID?.() ||
			`${Date.now()}-${Math.random().toString(36).slice(2)}`;
		window.localStorage.setItem(SERVICE_WORKER_CLIENT_KEY, generated);
		return generated;
	} catch {
		return "";
	}
}

function reportServiceWorkerEvent(eventType, registration, details = {}) {
	return fetch("/api/maintenance/service-worker/events", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			eventType,
			version: APP_SERVICE_WORKER_VERSION,
			clientId: getServiceWorkerClientId(),
			path: window.location.pathname,
			details: {
				scope: registration?.scope || "",
				workerState:
					registration?.installing?.state ||
					registration?.waiting?.state ||
					registration?.active?.state ||
					"unknown",
				controlled: Boolean(navigator.serviceWorker.controller),
				displayMode: window.matchMedia?.("(display-mode: standalone)")?.matches
					? "standalone"
					: "browser",
				...details,
			},
		}),
	}).catch(() => null);
}

export function activateWaitingServiceWorker(registration) {
	registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
}

export function confirmPwaUpdate(registration, storage) {
	storage.setItem(PWA_UPDATE_CONFIRMED_KEY, "1");
	activateWaitingServiceWorker(registration);
}

export function consumePwaUpdateConfirmation(storage) {
	if (storage.getItem(PWA_UPDATE_CONFIRMED_KEY) !== "1") return false;
	storage.removeItem(PWA_UPDATE_CONFIRMED_KEY);
	return true;
}

export function watchForServiceWorkerUpdate(registration) {
	const notify = () => {
		if (!registration.waiting || !navigator.serviceWorker.controller) return;
		window.dispatchEvent(new CustomEvent(PWA_UPDATE_AVAILABLE_EVENT, { detail: { registration } }));
		reportServiceWorkerEvent("UPDATE_READY", registration);
	};

	notify();
	registration.addEventListener("updatefound", () => {
		reportServiceWorkerEvent("UPDATE_FOUND", registration);
		const installing = registration.installing;
		installing?.addEventListener("statechange", () => {
			if (installing.state === "installed") notify();
		});
	});
}

export function registerAppServiceWorker() {
	if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
		return Promise.resolve(null);
	}

	if (!serviceWorkerRegistrationPromise) {
		serviceWorkerRegistrationPromise = navigator.serviceWorker
			.register(buildServiceWorkerUrl())
			.then((registration) => {
				reportServiceWorkerEvent("HEARTBEAT", registration);
				watchForServiceWorkerUpdate(registration);
				return registration;
			})
			.catch((error) => {
				console.warn("[PWA] Falha ao registrar service worker:", error);
				serviceWorkerRegistrationPromise = null;
				return null;
			});
	}

	return serviceWorkerRegistrationPromise;
}
