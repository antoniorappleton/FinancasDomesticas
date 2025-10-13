// sw.js — PWA com base path dinâmico (localhost + GitHub Pages)
const VERSION = (self.APP_VERSION || "v12") + "-" + Date.now();

// Base do scope: ex. "https://user.github.io/REPO/" -> "/REPO"
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const withBase = (p) => `${BASE_PATH}${p}`;

const CACHE_STATIC = `wisebudget-static-${VERSION}`;
const CACHE_DYNAMIC = `wisebudget-dynamic-${VERSION}`;

const APP_SHELL = [
  withBase("/"),
  withBase("/index.html"),
  withBase("/styles.css"),
  withBase("/main.js"),
  withBase("/manifest.json"),
  withBase("/wisebudget_bk_wt.png"),
  withBase("/icon-192.png"),
  withBase("/icon-512.png"),

  // screens (HTML)
  withBase("/src/screens/dashboard.html"),
  withBase("/src/screens/transactions.html"),
  withBase("/src/screens/nova.html"),
  withBase("/src/screens/settings.html"),
  withBase("/src/screens/categories.html"),
  withBase("/src/screens/objetivos.html"),

  // screens (JS)
  withBase("/src/screens/dashboard.js"),
  withBase("/src/screens/transactions.js"),
  withBase("/src/screens/nova.js"),
  withBase("/src/screens/settings.js"),
  withBase("/src/screens/categories.js"),
  withBase("/src/screens/objetivos.js"),

  // módulos locais
  withBase("/src/screens/export-template.js"),
  withBase("/src/lib/auth.js"),
];

// Helpers
const isHttp = (u) => u.startsWith("http://") || u.startsWith("https://");
const sameOrigin = (u) => new URL(u).origin === self.location.origin;
const isWS = (u) => u.startsWith("ws:") || u.startsWith("wss:");
const isRealtime = (u) => /\/realtime\//i.test(u) || isWS(u);

// INSTALL — pré-cache
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

// ACTIVATE — limpa caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![CACHE_STATIC, CACHE_DYNAMIC].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// FETCH — estratégias por tipo
self.addEventListener("fetch", (event) => {
  let req = event.request;
  const url = new URL(req.url);

  if (!isHttp(req.url)) return;
  if (isRealtime(req.url) || req.headers.has("range")) return;

  // corrige typo /scr/ → /src/
  if (url.pathname.startsWith(`${BASE_PATH}/scr/`)) {
    url.pathname = url.pathname.replace(
      `${BASE_PATH}/scr/`,
      `${BASE_PATH}/src/`
    );
    req = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      mode: req.mode,
      credentials: req.credentials,
      redirect: req.redirect,
    });
  }

  // Navegação SPA: network-first + fallback offline
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_STATIC);
          const cached = await cache.match(withBase("/index.html"));
          return (
            cached ||
            new Response("<h1>Offline</h1>", {
              headers: { "Content-Type": "text/html" },
            })
          );
        }
      })()
    );
    return;
  }

  if (req.method !== "GET" || !sameOrigin(req.url)) return;

  const isShell = APP_SHELL.includes(url.pathname);

  event.respondWith(
    (async () => {
      const cacheName = isShell ? CACHE_STATIC : CACHE_DYNAMIC;
      const cache = await caches.open(cacheName);

      // tenta sem query para APP_SHELL
      if (isShell) {
        const noQueryReq = new Request(url.origin + url.pathname, {
          method: "GET",
          headers: req.headers,
        });
        const cachedNoQuery = await cache.match(noQueryReq);
        if (cachedNoQuery) {
          fetch(req)
            .then((res) => {
              if (res && res.ok) cache.put(req, res.clone());
            })
            .catch(() => {});
          return cachedNoQuery;
        }
      }

      const cached = await cache.match(req);
      if (cached) {
        fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
          })
          .catch(() => {});
        return cached;
      }

      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
        return res;
      } catch {
        return new Response("", { status: 504, statusText: "Offline" });
      }
    })()
  );
});
