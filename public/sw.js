const CACHE_NAME = "retiradas-pwa-v17";
const APP_SHELL = [
  "/index.html",
  "/painel",
  "/painel/relatorios",
  "/painel/mapa",
  "/painel/match",
  "/terceiros",
  "/terceirizados",
  "/terceirizados/login",
  "/terceiros/consulta-mac",
  "/terceirizados/consulta-mac",
  "/aa-sempre",
  "/duvidas",
  "/manifest.webmanifest",
  "/terceiros.webmanifest",
  "/pwa-192.png",
  "/pwa-512.png",
  "/terceiros-pwa-192-v2.png",
  "/terceiros-pwa-512-v2.png",
  "/terceiros-apple-touch-icon-v2.png",
  "/apple-touch-icon.png",
  "/favicon-64.png",
  "/cluster-mg.png",
  "/melz-logo.png",
  "/retorninho-loader.png",
  "/retorninho-grinch.png",
];

function parsePushPayload(event) {
  if (!event?.data) return {};

  try {
    return event.data.json() || {};
  } catch {
    try {
      return {
        notification: {
          title: "Painel de Retiradas",
          body: event.data.text(),
        },
      };
    } catch {
      return {};
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

function cacheIndexResponse(response) {
  if (response && response.ok && response.type === "basic") {
    const copy = response.clone();
    caches.open(CACHE_NAME)
      .then((cache) => cache.put("/index.html", copy))
      .catch(() => {});
  }
  return response;
}

function fetchNavigation(request) {
  return fetch(request)
    .then(cacheIndexResponse)
    .catch(() => caches.match("/index.html"));
}

function fetchAndCacheAsset(request) {
  return fetch(request).then((response) => {
    if (!response || response.status !== 200 || response.type !== "basic") {
      return response;
    }

    const copy = response.clone();
    caches.open(CACHE_NAME)
      .then((cache) => cache.put(request, copy))
      .catch(() => {});
    return response;
  });
}

function fetchSameOriginAsset(request) {
  return caches.match(request).then((cached) => cached || fetchAndCacheAsset(request).catch(() => Response.error()));
}

function handleGetRequest(event) {
  const { request } = event;
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin && url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetchNavigation(request));
  } else if (isSameOrigin) {
    event.respondWith(fetchSameOriginAsset(request));
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") {
    handleGetRequest(event);
  }
});

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const notification = payload?.notification || payload?.data?.notification || {};
  const data = payload?.data || {};
  const title = notification.title || data.title || "Atualizacao no Painel de Retiradas";
  const body = notification.body || data.body || "Novos dados estao disponiveis.";
  const icon = notification.icon || data.icon || "/pwa-192.png";
  const badge = notification.badge || data.badge || "/favicon-64.png";
  const route = data.route || payload?.fcmOptions?.link || "/painel";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: {
        route,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const route = event.notification?.data?.route || "/painel";
  const targetUrl = new URL(route, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});

