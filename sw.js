// sw.js — Wisebudget PWA (fortalecido)
const VERSION = (self.APP_VERSION || "v12") + "-" + Date.now(); // força update em dev
const CACHE_STATIC = `wisebudget-static-${VERSION}`;
const CACHE_DYNAMIC = `wisebudget-dynamic-${VERSION}`;

const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/main.js",
  "/manifest.json",
  "/wisebudget_bk_wt.png",
  "/icon-192.png",
  "/icon-512.png",

  // screens (HTML)
  "/src/screens/dashboard.html",
  "/src/screens/transactions.html",
  "/src/screens/nova.html",
  "/src/screens/settings.html",
  "/src/screens/categories.html",
  "/src/screens/objetivos.html",

  // screens (JS)
  "/src/screens/dashboard.js",
  "/src/screens/transactions.js",
  "/src/screens/nova.js",
  "/src/screens/settings.js",
  "/src/screens/categories.js",
  "/src/screens/objetivos.js",

  // módulos locais
  "/src/screens/export-template.js",
  "/src/lib/auth.js",
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

  // apenas HTTP(s)
  if (!isHttp(req.url)) return;

  // ignora Supabase realtime/websockets e Range requests
  if (isRealtime(req.url) || req.headers.has("range")) return;

  // corrige typo /scr/ → /src/ (defesa extra)
  if (url.pathname.startsWith("/scr/")) {
    url.pathname = url.pathname.replace(/^\/scr\//, "/src/");
    req = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      mode: req.mode,
      credentials: req.credentials,
      redirect: req.redirect,
    });
  }

  // Navegação SPA: network-first + fallback offline (index.html)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_STATIC);
          const cached = await cache.match("/index.html");
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

  // só cacheamos GET de mesma origem
  if (req.method !== "GET" || !sameOrigin(req.url)) return;

  const isShell = APP_SHELL.includes(url.pathname);

  event.respondWith(
    (async () => {
      const cacheName = isShell ? CACHE_STATIC : CACHE_DYNAMIC;
      const cache = await caches.open(cacheName);

      // tenta sem query string para ficheiros do APP_SHELL
      if (isShell) {
        const noQueryReq = new Request(url.origin + url.pathname, {
          method: "GET",
          headers: req.headers,
        });
        const cachedNoQuery = await cache.match(noQueryReq);
        if (cachedNoQuery) {
          // atualiza em background
          fetch(req)
            .then((res) => {
              if (res && res.ok) cache.put(req, res.clone());
            })
            .catch(() => {});
          return cachedNoQuery;
        }
      }

      // cache-first com SWR
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
