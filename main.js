// main.js — Router SPA com imports dinâmicos e FAB menu
import { initAuth } from "./src/lib/auth.js";

/* ===================== Helpers ===================== */
const $ = (sel, root = document) => root.querySelector(sel);
const setStyle = (el, styles = {}) => el && Object.assign(el.style, styles);

// aguarda o cliente Supabase ficar disponível (até 3s)
async function waitForSupabase(maxMs = 3000) {
  const start = performance.now();
  while (!window.sb) {
    await new Promise(r => setTimeout(r, 30));
    if (performance.now() - start > maxMs) throw new Error("Supabase não inicializou (window.sb).");
  }
  return window.sb;
}

/* ===================== Router config ===================== */
const outlet = document.getElementById("outlet");
const footer = document.getElementById("app-footer");
const APPV = (window.APP_VERSION || "v10") + "-" + Date.now();

const ROUTES = {
  "#/":              { file: "./src/screens/dashboard.html",   js: "./src/screens/dashboard.js",   showFooter: true },
  "#/transactions":  { file: "./src/screens/transactions.html",js: "./src/screens/transactions.js",showFooter: true },
  "#/new":           { file: "./src/screens/nova.html",         js: "./src/screens/nova.js",        showFooter: true },
  "#/settings":      { file: "./src/screens/settings.html",     js: "./src/screens/settings.js",    showFooter: true },
  "#/categories":    { file: "./src/screens/categories.html",   js: "./src/screens/categories.js",  showFooter: true },
  "#/objetivos":     { file: "./src/screens/objetivos.html",    js: "./src/screens/objetivos.js",   showFooter: true },
};

function normalizeRoute(hash) {
  if (!hash || hash === "#" || hash === "#/") return "#/";
  const clean = hash.split("?")[0];
  return ROUTES[clean] ? clean : "#/";
}

function setActiveTab() {
  const hash = normalizeRoute(location.hash || "#/");
  document.querySelectorAll(".foot-item").forEach((a) => {
    const href = a.getAttribute("href");
    a.toggleAttribute("aria-current", href === hash);
  });
}

async function loadScreen(route) {
  const r = ROUTES[route] || ROUTES["#/"];
  setStyle(outlet, { opacity: "0", transition: "opacity .15s ease" });
  await new Promise((r) => setTimeout(r, 90));

  try {
    // carrega HTML
    const res = await fetch(`${r.file}?v=${APPV}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Não encontrei ${r.file} (HTTP ${res.status})`);
    outlet.innerHTML = await res.text();

    // mostra/oculta footer
    if (footer) footer.style.display = r.showFooter ? "grid" : "none";

    // ativa tab
    setActiveTab();

    // carrega controlador JS
    if (r.js) {
      try {
        const mod = await import(`${r.js}?v=${APPV}`);
        const fn = mod.init || mod.default;
        if (typeof fn === "function") await fn({ sb: window.sb, outlet, route });
      } catch (e) {
        console.warn("Controller JS falhou:", r.js, e);
      }
    }
  } catch (e) {
    console.error(e);
    outlet.innerHTML = `<div class="card" style="margin:12px">
      <strong>Erro ao carregar o ecrã.</strong><br/>
      <small>${(e && e.message) || String(e)}</small>
    </div>`;
  } finally {
    requestAnimationFrame(() => setStyle(outlet, { opacity: "1" }));
  }
}

let routing = false;
async function handleRoute() {
  if (routing) return;
  routing = true;
  try {
    const sb = await waitForSupabase(); // ⬅️ garante sb
    const { data: { session } } = await sb.auth.getSession();
    const route = normalizeRoute(location.hash);
    if (!session) {
      outlet.innerHTML = "";
      if (footer) footer.style.display = "none";
    } else {
      await loadScreen(route);
    }
  } catch (e) {
    console.error(e);
    outlet.innerHTML = `<div class="card" style="margin:12px">
      <strong>Erro na navegação.</strong><br/>
      <small>${(e && e.message) || String(e)}</small>
    </div>`;
  } finally {
    routing = false;
  }
}

/* ===================== Auth callbacks ===================== */
function onSignedIn() {
  setStyle(document.getElementById("app-main"), { display: "" });
  if (footer) footer.hidden = false;
  const login = document.getElementById("screen-login");
  if (login) login.classList.add("hidden");
  handleRoute();
}
function onSignedOut() {
  setStyle(document.getElementById("app-main"), { display: "none" });
  if (footer) footer.hidden = true;
  const login = document.getElementById("screen-login");
  if (login) {
    login.classList.remove("hidden");
    setStyle(login, { display: "grid" });
  }
}

/* ===================== Arranque ===================== */
(async function boot(){
  try {
    await waitForSupabase(); // ⬅️ só arranca quando sb existir
    initAuth({ onSignedIn, onSignedOut });
    window.addEventListener("hashchange", handleRoute);
    window.addEventListener("DOMContentLoaded", () => {
      setActiveTab();
      handleRoute();
    });
    window.dispatchEvent(new Event("app:ready"));
  } catch (e) {
    console.error("Falha no arranque:", e);
  }
})();

/* ===================== FAB Menu ===================== */

(function(){
  const fab = document.getElementById('fabNav');
  if (!fab) return;

  const toggle = document.getElementById('fabToggle');
  const itemsWrap = document.getElementById('fabItems');
  const items = [...fab.querySelectorAll('.fab-item')];

  const open = () => {
    fab.classList.add('is-open');
    toggle.setAttribute('aria-expanded','true');
    itemsWrap.hidden = false;
    itemsWrap.setAttribute('aria-hidden','false');
  };
  const close = () => {
    fab.classList.remove('is-open');
    toggle.setAttribute('aria-expanded','false');
    itemsWrap.setAttribute('aria-hidden','true');
    setTimeout(() => { if (!fab.classList.contains('is-open')) itemsWrap.hidden = true; }, 350);
  };
  const toggleMenu = () => fab.classList.contains('is-open') ? close() : open();

  toggle.addEventListener('click', toggleMenu);
  document.addEventListener('pointerdown', (e) => { if (!fab.contains(e.target)) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // clicar num item: navega e fecha
  items.forEach(btn => {
    btn.addEventListener('click', () => {
      const href = btn.getAttribute('data-href');
      if (href) location.hash = href;
      close();
    });
  });
})();
