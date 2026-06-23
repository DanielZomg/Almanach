// Service worker : installation hors-ligne + cache des images d'œuvres.
const VERSION = "almanach-v1";
const SHELL = [
  ".",
  "index.html",
  "css/styles.css",
  "js/app.js",
  "js/state.js",
  "js/util.js",
  "js/puzzles.js",
  "data/blasons.json",
  "data/puzzles.json",
  "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Images d'œuvres (Wikimedia) : cache-first, conservées pour l'hors-ligne.
  if (/wikimedia\.org$/.test(url.hostname) || /wikipedia\.org$/.test(url.hostname)) {
    e.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // Reste : cache d'abord, réseau en secours.
  e.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      if (res.ok && url.origin === location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
      }
      return res;
    }).catch(() => cached))
  );
});
