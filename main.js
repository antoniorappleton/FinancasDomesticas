// main.js — Router SPA com base path dinâmico (localhost + GitHub Pages)
import { initAuth } from "./src/lib/auth.js";

/* ===================== Base path ===================== */
// Ex.: / -> "" ; /REPO -> "/REPO" ; /REPO/index.html -> "/REPO"
const BASE_PATH = (() => {
  const p = location.pathname;
  const noIndex = p.replace(/\/index\.html$/i, "");
  // remove trailing slash excepto quando é só "/"
  return noIndex === "/" ? "" : noIndex.replace(/\/$/, "");
})();

const resolveUrl = (path) => {
  // absolute http(s) or protocol-relative
  if (/^https?:\/\//i.test(path)) return path;
  // remove any leading "./"
  const clean = path.replace(/^\.\//, "");
  // Se o path começa por "/", prefixamos com BASE_PATH
  if (clean.startsWith("/")) return `${BASE_PATH}${clean}`;
  // senão, relativo a BASE_PATH
  return `${BASE_PATH}/${clean}`;
};

/* ===================== Helpers ===================== */
const $ = (sel, root = document) => root.querySelector(sel);
const setStyle = (el, styles = {}) => el && Object.assign(el.style, styles);

// aguarda o cliente Supabase ficar disponível (até 3s)
async function waitForSupabase(maxMs = 3000) {
  const start = performance.now();
  while (!window.sb) {
    await new Promise((r) => setTimeout(r, 30));
    if (performance.now() - start > maxMs) {
      throw new Error("Supabase não inicializou (window.sb).");
    }
  }
  return window.sb;
}

/* ===================== Router config ===================== */
const outlet = document.getElementById("outlet");
const footer = document.getElementById("app-footer");
const APPV = (window.APP_VERSION || "v12") + "-" + Date.now();

const ROUTES = {
  "#/": {
    file: "/src/screens/dashboard.html",
    js: "/src/screens/dashboard.js",
    showFooter: true,
  },
  "#/Movimentos": {
    file: "/src/screens/Movimentos.html",
    js: "/src/screens/Movimentos.js",
    showFooter: true,
  },
  "#/new": {
    file: "/src/screens/nova.html",
    js: "/src/screens/nova.js",
    showFooter: true,
  },
  "#/settings": {
    file: "/src/screens/settings.html",
    js: "/src/screens/settings.js",
    showFooter: true,
  },
  "#/categories": {
    file: "/src/screens/categories.html",
    js: "/src/screens/categories.js",
    showFooter: true,
  },
  "#/Metas": {
    file: "/src/screens/Metas.html",
    js: "/src/screens/Metas.js",
    showFooter: true,
  },
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
  await new Promise((res) => setTimeout(res, 90));

  try {
    // carrega HTML (sem cache) usando base path
    const htmlURL = `${resolveUrl(r.file)}?v=${APPV}`;
    const res = await fetch(htmlURL, { cache: "no-store" });
    if (!res.ok)
      throw new Error(`Não encontrei ${r.file} (HTTP ${res.status})`);
    outlet.innerHTML = await res.text();

    // footer visível/oculto conforme rota
    if (footer) footer.style.display = r.showFooter ? "grid" : "none";

    // ativa tab corrente
    setActiveTab();

    // carrega controlador JS do ecrã
    if (r.js) {
      try {
        const jsURL = `${resolveUrl(r.js)}?v=${APPV}`;
        const mod = await import(jsURL);
        const fn = mod.init || mod.default;
        if (typeof fn === "function")
          await fn({ sb: window.sb, outlet, route });
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
    const sb = await waitForSupabase();
    const {
      data: { session },
    } = await sb.auth.getSession();
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
(async function boot() {
  try {
    await waitForSupabase();
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

/* ===================== FAB (menu flutuante) ===================== */
(() => {
  const root = document.querySelector(".fab-nav");
  if (!root) return;

  const toggle = root.querySelector("#fabToggle");
  const wrap = root.querySelector("#fabItems");
  const items = [...root.querySelectorAll(".fab-item")];
  if (!toggle || !wrap || items.length === 0) return;

  function layout() {
    const ds = getComputedStyle(document.documentElement);
    const itemD =
      parseFloat(ds.getPropertyValue("--fab-item-d")) ||
      Math.max(54, Math.min(66, window.innerWidth * 0.08));
    const radius =
      parseFloat(ds.getPropertyValue("--fab-arc-radius")) ||
      Math.max(110, Math.min(180, window.innerWidth * 0.24));
    const spreadD = parseFloat(ds.getPropertyValue("--fab-arc-spread")) || 160; // graus
    const spread = (Math.max(40, Math.min(180, spreadD)) * Math.PI) / 180;
    const n = items.length;
    if (!n) return;

    const center = (-90 * Math.PI) / 180;
    const start = center - spread / 2;
    const end = center + spread / 2;
    const ang = (i) =>
      n === 1 ? center : start + (i * (end - start)) / (n - 1);

    items.forEach((btn, i) => {
      const a = ang(i);
      const x = radius * Math.cos(a);
      const y = radius * Math.sin(a);
      btn.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      const label = btn.querySelector(".fab-label");
      if (label) label.classList.toggle("below", !(y < -itemD * 0.5));
    });
  }

  function open() {
    root.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    wrap.hidden = false;
    wrap.setAttribute("aria-hidden", "false");
    requestAnimationFrame(layout);
  }
  function close() {
    root.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    wrap.setAttribute("aria-hidden", "true");
    items.forEach((btn) => (btn.style.transform = "translate(-50%,-50%)"));
    setTimeout(() => {
      if (!root.classList.contains("is-open")) wrap.hidden = true;
    }, 320);
  }

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    (root.classList.contains("is-open") ? close : open)();
  });

  window.addEventListener("resize", () => {
    if (root.classList.contains("is-open")) layout();
  });

  items.forEach((btn) => {
    btn.addEventListener("click", () => {
      const to = btn.getAttribute("data-to");
      if (to) location.hash = to;
      close();
    });
  });
})();
