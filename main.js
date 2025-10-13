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
const APPV = (window.APP_VERSION || "v11") + "-" + Date.now();

const ROUTES = {
  "#/": {
    file: "/src/screens/dashboard.html",
    js: "/src/screens/dashboard.js",
    showFooter: true,
  },
  "#/transactions": {
    file: "/src/screens/transactions.html",
    js: "/src/screens/transactions.js",
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
  "#/objetivos": {
    file: "/src/screens/objetivos.html",
    js: "/src/screens/objetivos.js",
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

// === FAB menu: abre, fecha e distribui itens sem sair da largura ===
// FAB – fan-out para a esquerda e direita (todos os itens)
(() => {
  const root = document.querySelector(".fab-nav");
  if (!root) return;

  const toggle = root.querySelector("#fabToggle");
  const wrap = root.querySelector("#fabItems");
  const items = [...root.querySelectorAll(".fab-item")];

  // segurança mínima
  if (!toggle || !wrap || items.length === 0) return;

  // parâmetros responsivos
  const css = getComputedStyle(document.documentElement);
  const num = (s) => parseFloat(s) || 0;

  // defaults caso não definas variáveis na :root
  function params() {
    return {
      d:
        num(css.getPropertyValue("--fab-item-d")) ||
        Math.max(54, Math.min(66, window.innerWidth * 0.08)),
      gap:
        num(css.getPropertyValue("--fab-gap")) ||
        Math.max(14, Math.min(22, window.innerWidth * 0.045)),
      safe: num(css.getPropertyValue("--fab-safe")) || 16,
    };
  }

  // distribui alternando L/R a partir do centro: L1, R1, L2, R2...
  // ===== ARCO acima do botão (leque) =====
  function layout() {
    const ds = getComputedStyle(document.documentElement);

    // lê variáveis (com fallback)
    const itemD =
      parseFloat(ds.getPropertyValue("--fab-item-d")) ||
      Math.max(54, Math.min(66, window.innerWidth * 0.08));
    const radius =
      parseFloat(ds.getPropertyValue("--fab-arc-radius")) ||
      Math.max(110, Math.min(180, window.innerWidth * 0.24));
    const spreadD = parseFloat(ds.getPropertyValue("--fab-arc-spread")) || 160; // graus
    const spread = (Math.max(40, Math.min(180, spreadD)) * Math.PI) / 180; // radianos

    const n = items.length;
    if (!n) return;

    // centro do arco apontado para cima (-90°)
    const center = (-90 * Math.PI) / 180;
    const start = center - spread / 2;
    const end = center + spread / 2;

    // distribuir ângulos uniformemente no intervalo [start, end]
    const ang = (i) =>
      n === 1 ? center : start + (i * (end - start)) / (n - 1);

    // posicionar cada item
    items.forEach((btn, i) => {
      const a = ang(i);
      const x = radius * Math.cos(a); // +direita / -esquerda
      const y = radius * Math.sin(a); // negativo = para cima (é o que queremos)

      btn.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

      // (opcional) rodar etiqueta sempre “para fora” do arco:
      const label = btn.querySelector(".fab-label");
      if (label) {
        const isAbove = y < -itemD * 0.5;
        label.classList.toggle("below", !isAbove); // acima por defeito; abaixo se estiver muito “baixo”
      }
    });
  }

  function open() {
    root.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    wrap.hidden = false;
    wrap.setAttribute("aria-hidden", "false");
    requestAnimationFrame(layout);
    window.addEventListener("resize", () => {
      if (root.classList.contains("is-open")) layout();
    });
    
  }
  
  function close() {
    root.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    wrap.setAttribute("aria-hidden", "true");
    // regressam ao centro
    items.forEach((btn) => (btn.style.transform = "translate(-50%,-50%)"));
    setTimeout(() => {
      if (!root.classList.contains("is-open")) wrap.hidden = true;
    }, 320);
  }

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    (root.classList.contains("is-open") ? close : open)();
  });

  // recalc em resize/orientation
  window.addEventListener("resize", () => {
    if (root.classList.contains("is-open")) layout();
  });

  // clicar numa ação: navega e fecha
  items.forEach((btn) => {
    btn.addEventListener("click", () => {
      const to = btn.getAttribute("data-to");
      if (to) location.hash = to;
      close();
    });
  });
})();

