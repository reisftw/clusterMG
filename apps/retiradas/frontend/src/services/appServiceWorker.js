let serviceWorkerRegistrationPromise = null;
const APP_SERVICE_WORKER_VERSION =
	"2026-09-28-acompanhamento-assets-network-first-v1";

function buildServiceWorkerUrl() {
	const params = new URLSearchParams({
		v: APP_SERVICE_WORKER_VERSION,
	});

	return `/sw.js?${params.toString()}`;
}

export function registerAppServiceWorker() {
	if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
		return Promise.resolve(null);
	}

	if (!serviceWorkerRegistrationPromise) {
		serviceWorkerRegistrationPromise = navigator.serviceWorker
			.register(buildServiceWorkerUrl())
			.catch((error) => {
				console.warn("[PWA] Falha ao registrar service worker:", error);
				serviceWorkerRegistrationPromise = null;
				return null;
			});
	}

	return serviceWorkerRegistrationPromise;
}
