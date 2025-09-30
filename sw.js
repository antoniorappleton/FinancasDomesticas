// SW com versionamento e estratégia segura para screens (network-first)
const APP_VERSION = "v10";
const STATIC_CACHE = `static-${APP_VERSION}`;
const PRECACHE = ["./", "./index.html", "./styles.css", "./main.js"];
const SCREENS_RE = /\/src\/screens\/.+\.(html|js)(\?.*)?$/;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith("static-") && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Nunca interceptar Supabase/APIs
  if (/supabase\.co|\/rest\/v1|\/auth\//.test(url.href)) return;

  // Screens (HTML/JS importados dinamicamente): network-first SEMPRE
  if (SCREENS_RE.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        return await fetch(req, { cache: "no-store" });
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(req, { ignoreSearch: true });
        return cached || Response.error();
      }
    })());
    return;
  }

  // Navegação/HTML: network-first
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match(req)) || fetch(req);
      }
    })());
    return;
  }

  // Restante (stale-while-revalidate)
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req);
    const fetchAndUpdate = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fetchAndUpdate;
  })());
});

// Limpeza manual
self.addEventListener("message", (e) => {
  if (e.data === "CLEAR_ALL") {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});
