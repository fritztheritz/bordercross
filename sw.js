// BorderCross — service worker.
//
// Caches the app shell (everything the core game logic needs — data,
// graph, game state, UI) so the puzzle itself works offline once visited.
// The route map still needs a network connection: Leaflet, the web fonts,
// and the Esri basemap tiles are all cross-origin and intentionally left
// alone here (see the fetch handler below) — they fail gracefully (blank
// tiles) rather than breaking anything if the network is down.
//
// Strategy is stale-while-revalidate: respond from cache immediately when
// available (instant load, works offline), then update the cache from the
// network in the background so the *next* load picks up any change.

const CACHE_NAME = "bordercross-shell-v2";

const APP_SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "css/styles.css",
  "js/data.js",
  "js/graph.js",
  "js/lookup.js",
  "js/game.js",
  "js/stats.js",
  "js/map.js",
  "js/daily.js",
  "js/share.js",
  "js/sound.js",
  "js/confetti.js",
  "js/ui.js",
  "js/main.js",
  "assets/logo-icon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // let fonts/Leaflet/tiles pass through untouched
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
