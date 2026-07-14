const CACHE_NAME = "fluxo-app-v2.2.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./css/dashboard.css",
  "./css/forms.css",
  "./css/tables.css",
  "./css/responsive.css",
  "./js/app.js?v=2.2.0",
  "./js/storage.js",
  "./js/cloud.js?v=2.2.0",
  "./js/dashboard.js",
  "./js/finance.js",
  "./js/goals.js",
  "./js/charts.js",
  "./js/ui.js",
  "./js/utils.js",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-maskable.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-192.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/images/avatar-placeholder.svg",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.3/+esm"
];

const STATIC_CDN_HOSTS = new Set([
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => Promise.allSettled(APP_SHELL.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === "navigate";
  const isSameOrigin = url.origin === self.location.origin;
  const isStaticCdn = STATIC_CDN_HOSTS.has(url.hostname);
  const isSupabaseApi = url.hostname.endsWith(".supabase.co");

  // Nunca guarda autenticação, REST, Realtime ou outros dados do Supabase no Cache Storage.
  if (isSupabaseApi) return;
  if (!isSameOrigin && !isStaticCdn) return;

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && (response.ok || response.type === "opaque")) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
