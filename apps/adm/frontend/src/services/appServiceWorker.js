let serviceWorkerRegistrationPromise = null;
const APP_SERVICE_WORKER_VERSION =
	"2026-09-15-adm-facilities-rbac-inventory-v3";

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
			.then((registration) => {
				let refreshing = false;
				navigator.serviceWorker.addEventListener("controllerchange", () => {
					if (refreshing) return;
					refreshing = true;
					window.location.reload();
				});

				if (registration.waiting) {
					registration.waiting.postMessage({ type: "SKIP_WAITING" });
				}

				registration.addEventListener("updatefound", () => {
					const worker = registration.installing;
					if (!worker) return;
					worker.addEventListener("statechange", () => {
						if (
							worker.state === "installed" &&
							navigator.serviceWorker.controller
						) {
							worker.postMessage({ type: "SKIP_WAITING" });
						}
					});
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
