const CACHE_NAME = "hf-v8";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./main.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
          )
        ),
      self.clients.claim(),
    ])
  );
});

// evita cachear recursos com ?v= (cache-busting) em dev
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.url.includes("?v=")) {
    event.respondWith(fetch(req));
    return;
  }
  event.respondWith(caches.match(req).then((res) => res || fetch(req)));
});
