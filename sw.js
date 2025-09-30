// sw.js — Wisebudget PWA (hardened)
// ---------------------------------
const VERSION = (self.APP_VERSION || 'v1') + '-' + Date.now(); // força update em dev
const CACHE_STATIC = `wisebudget-static-${VERSION}`;
const CACHE_DYNAMIC = `wisebudget-dynamic-${VERSION}`;
const APP_SHELL = [
  '/',                // só funciona quando alojado na raiz; ajusta se necessário
  '/index.html',
  '/styles.css',
  '/main.js',
  '/wisebudget.png',
  // screens (html)
  '/src/screens/dashboard.html',
  '/src/screens/transactions.html',
  '/src/screens/nova.html',
  '/src/screens/settings.html',
  '/src/screens/categories.html',
  // screens (js)
  '/src/screens/dashboard.js',
  '/src/screens/transactions.js',
  '/src/screens/nova.js',
  '/src/screens/settings.js',
  '/src/screens/categories.js',
  // libs via CDN NÃO devem ser pré-cacheadas (variantes/versões podem bloquear)
];

// Helpers
const isHttp = (req) => req.url.startsWith('http://') || req.url.startsWith('https://');
const isSameOrigin = (req) => new URL(req.url).origin === self.location.origin;
const isChromeExt = (req) => req.url.startsWith('chrome-extension://');
const isSupabaseRealtime = (u) => /\/realtime\//i.test(u) || u.startsWith('wss://');
const isRange = (req) => req.headers.has('range');

// INSTALL: pré-cache do app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

// ACTIVATE: limpar caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => ![CACHE_STATIC, CACHE_DYNAMIC].includes(k))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// FETCH: estratégias
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ignorar esquemas não suportados
  if (!isHttp(req) || isChromeExt(req)) return;

  // Ignorar WebSocket / Supabase realtime e Range Requests (deixa rede tratar)
  if (isSupabaseRealtime(req.url) || isRange(req)) return;

  // Navegação SPA: network-first com fallback offline (index.html)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_STATIC);
        const cached = await cache.match('/index.html');
        return cached || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' }});
      }
    })());
    return;
  }

  // Apenas GET mesma origem entra em cache; terceiros = network-only
  if (req.method !== 'GET' || !isSameOrigin(req)) {
    return; // deixa a rede tratar
  }

  // Cache-first para o APP_SHELL; stale-while-revalidate para restantes same-origin
  const url = new URL(req.url);
  const isShell = APP_SHELL.some(p => url.pathname === p);

  event.respondWith((async () => {
    const cacheName = isShell ? CACHE_STATIC : CACHE_DYNAMIC;
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);
    if (cached) {
      // Atualiza em background (stale-while-revalidate) para não bloquear a UI
      fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); }).catch(()=>{});
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        // Só cacheia respostas simples (sem opaques)
        cache.put(req, res.clone());
      }
      return res;
    } catch {
      // Fallback genérico
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
