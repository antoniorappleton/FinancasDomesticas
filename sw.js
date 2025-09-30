// SW minimalista com versionamento
const APP_VERSION = "v7"; // <= MUDA isto a cada deploy
const STATIC_CACHE = `static-${APP_VERSION}`;

// Lista opcional de ficheiros críticos (podes deixar vazio)
const PRECACHE = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("static-") && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // nunca cachear chamadas ao Supabase ou outras APIs
  if (/supabase\.co|\/rest\/v1|\/auth\//.test(url.href)) return;

  // HTML: network-first
  if (
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html")
  ) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          return (await cache.match(req)) || fetch(req);
        }
      })()
    );
    return;
  }

  // restantes: stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      const fetchAndUpdate = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fetchAndUpdate;
    })()
  );
});

// limpar tudo quando pedirmos explicitamente
self.addEventListener("message", (e) => {
  if (e.data === "CLEAR_ALL") {
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});
