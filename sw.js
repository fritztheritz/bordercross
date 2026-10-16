// BorderCross — service worker.
//
// Caches the app shell (everything the core game logic needs — data,
// graph, game state, UI) so the puzzle itself works offline once visited.
// The route map still needs a network connection: Leaflet, the web fonts,
// and the Esri basemap tiles are all cross-origin and intentionally left
// alone here (see the fetch handler below) — they fail gracefully (blank
// tiles) rather than breaking anything if the network is down.
//
// The document (index.html) is network-first, so reopening the app always
// gets the current shell when online. Everything else is stale-while-
// revalidate: respond from cache immediately (instant load, works offline),
// then update the cache from the network in the background.
//
// CACHE_NAME must change whenever this file ships alongside other shell
// changes — service workers version by diffing *this script's own bytes*,
// not by anything else in APP_SHELL, so a deploy that doesn't touch this
// file never registers as "a new version" no matter what else changed.

const CACHE_NAME = "bordercross-shell-v3";

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

  // The document itself goes network-first: reopening an installed PWA is
  // exactly the moment a stale cached shell matters most, and serving it
  // cache-first here (like everything else below) would mean a reopen can
  // hand back yesterday's index.html indefinitely, deploy after deploy.
  // Falls back to cache only when actually offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      // no-store, not just a plain fetch(): otherwise this is only as
      // network-first as the host's own Cache-Control header allows, which
      // defeats the point on a host that caches the document for any real
      // stretch of time.
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

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
