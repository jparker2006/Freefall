// Freefall service worker — minimal and conservative. Its job is twofold:
//   1. make the app installable (a PWA needs a SW with a fetch handler), so it runs
//      fullscreen from the home screen instead of inside browser chrome;
//   2. give a fast, offline-capable same-origin app shell.
//
// It deliberately NEVER touches cross-origin requests — the Google Photorealistic 3D
// Tiles and the MapLibre basemap are large, dynamic and authenticated, so they stay
// pure live network (we don't cache or intercept them).
const CACHE = "freefall-v1";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tiles / basemap / fonts → live network

  // Navigations: network-first so a fresh Vercel deploy shows immediately; fall back to the
  // cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html").then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Same-origin static assets (hashed → immutable): cache-first, then fill the cache.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => caches.match("/")),
    ),
  );
});
