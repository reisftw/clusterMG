const CACHE_NAME = "finan-pwa-v2";
const APP_SHELL = [
	"/manifest.webmanifest",
	"/pwa-192.png",
	"/pwa-512.png",
	"/apple-touch-icon.png",
	"/favicon-64.png",
	"/favicon-32.png",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(APP_SHELL))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
			)
			.then(() => self.clients.claim()),
	);
});

// So faz cache do app shell estatico (assets/manifest/icones). Nunca
// intercepta /api/ — dado financeiro sempre precisa vir da rede, nunca de
// um cache potencialmente desatualizado.
self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.startsWith("/api/")) return;

	// Navegacao (index.html / qualquer rota do SPA): sempre tenta a rede
	// primeiro. Um index.html cache-first, com CACHE_NAME que so muda quando
	// alguem lembra de editar este arquivo, faz o PWA instalado continuar
	// rodando a versao de ANTES de um deploy indefinidamente (foi o que
	// aconteceu com o app instalado no celular nao pedir PIN depois do
	// deploy que criou essa funcionalidade). Assets com hash no nome (JS/CSS
	// do build) continuam cache-first mais abaixo, ja que sao imutaveis por
	// natureza (o nome muda quando o conteudo muda).
	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request)
				.then((response) => {
					if (response && response.status === 200) {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
					}
					return response;
				})
				.catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
		);
		return;
	}

	event.respondWith(
		caches.match(request).then((cached) => {
			if (cached) return cached;
			return fetch(request)
				.then((response) => {
					if (response && response.status === 200 && response.type === "basic") {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
					}
					return response;
				})
				.catch(() => cached);
		}),
	);
});

// Web Push (VAPID): mostra a notificacao mandada pelo job de alertas do
// Calendario Financeiro (ver apps/finan/backend/src/calendario/alertsService.js).
// O payload e um JSON simples { title, body, url }.
self.addEventListener("push", (event) => {
	let payload = {};
	try {
		payload = event.data ? event.data.json() : {};
	} catch {
		payload = { title: "Finan", body: event.data ? event.data.text() : "" };
	}
	const title = payload.title || "Finan";
	const options = {
		body: payload.body || "",
		icon: "/pwa-192.png",
		badge: "/pwa-192.png",
		data: { url: payload.url || "/" },
	};
	event.waitUntil(self.registration.showNotification(title, options));
});

// Clicar na notificacao foca uma aba do Finan ja aberta (navegando pra
// URL do alerta) ou abre uma nova se nao houver nenhuma.
self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const targetUrl = event.notification.data?.url || "/";
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
			for (const client of clients) {
				if ("focus" in client) {
					client.navigate(targetUrl).catch(() => {});
					return client.focus();
				}
			}
			return self.clients.openWindow(targetUrl);
		}),
	);
});
