let serviceWorkerRegistrationPromise = null;
const APP_SERVICE_WORKER_VERSION = import.meta.env.VITE_APP_VERSION || "local";
const SERVICE_WORKER_CLIENT_KEY = "retiradas-sw-client-id";

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

export function registerAppServiceWorker() {
	if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
		return Promise.resolve(null);
	}

	if (!serviceWorkerRegistrationPromise) {
		serviceWorkerRegistrationPromise = navigator.serviceWorker
			.register(buildServiceWorkerUrl())
			.then((registration) => {
				reportServiceWorkerEvent("HEARTBEAT", registration);
				registration.addEventListener("updatefound", () => {
					reportServiceWorkerEvent("UPDATE_FOUND", registration);
				});
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
