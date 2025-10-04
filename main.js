// main.js — Router SPA com imports dinâmicos à prova de PWA
import { initAuth } from "./src/lib/auth.js";

const sb = window.sb;
if (!sb) throw new Error("Supabase client não inicializado (window.sb).");

const outlet = document.getElementById("outlet");
const footer = document.getElementById("app-footer");
const APPV = (window.APP_VERSION || "v10") + "-" + Date.now();

const ROUTES = {
  "#/": {
    file: "./src/screens/dashboard.html",
    js:   "./src/screens/dashboard.js",
    showFooter: true,
  },
  "#/transactions": {
    file: "./src/screens/transactions.html",
    js:   "./src/screens/transactions.js",
    showFooter: true,
  },
  "#/new": {
    file: "./src/screens/nova.html",
    js:   "./src/screens/nova.js",
    showFooter: true,
  },
  "#/settings": {
    file: "./src/screens/settings.html",
    js:   "./src/screens/settings.js",
    showFooter: true,
  },
  "#/categories": {
    file: "./src/screens/categories.html",
    js:   "./src/screens/categories.js",
    showFooter: true,
  },
  "#/objetivos": {
    file: "./src/screens/objetivos.html",
    js:   "./src/screens/objetivos.js",
    showFooter: true,
  },
};

function setActiveTab() {
  const hash = (location.hash || "#/").split("?")[0];
  const base = hash.split("/")[1] || "";
  const current = base ? `#/${base}` : "#/";
  document.querySelectorAll(".foot-item").forEach((a) => {
    a.toggleAttribute("aria-current", (a.getAttribute("href") || "") === current);
  });
}

async function loadScreen(route) {
  const r = ROUTES[route] || ROUTES["#/"];

  // Carregar HTML parcial (sem cache)
  const res = await fetch(`${r.file}?v=${APPV}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Não encontrei ${r.file} (HTTP ${res.status})`);
  outlet.innerHTML = await res.text();

  // Footer + tab ativa
  footer.style.display = r.showFooter ? "grid" : "none";
  setActiveTab();

  // Carregar controller JS (com cache-busting)
  if (r.js) {
    const mod = await import(`${r.js}?v=${APPV}`);
    const fn = mod.init || mod.default;
    if (typeof fn === "function") await fn({ sb, outlet, route });
  }
}

let routing = false;
async function handleRoute() {
  if (routing) return;
  routing = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    // normaliza para ignorar querystring no hash
    const raw = location.hash || "#/";
    const route = raw.split("?")[0];

    if (!session) {
      outlet.innerHTML = "";
      footer.style.display = "none";
    } else {
      await loadScreen(route);
    }
  } catch (e) {
    console.error(e);
    outlet.innerHTML = `<div class="card" style="margin:12px">
      <strong>Erro ao carregar o ecrã.</strong><br/>
      <small>${(e && e.message) || String(e)}</small>
    </div>`;
  } finally {
    routing = false;
  }
}

window.addEventListener("hashchange", handleRoute);
window.addEventListener("DOMContentLoaded", () => {
  setActiveTab();
  handleRoute();
});

initAuth({
  onSignedIn: handleRoute,
  onSignedOut: () => {
    outlet.innerHTML = "";
    footer.style.display = "none";
  },
});

// SW: registo relativo (scope seguro)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((reg) => {
        reg.onupdatefound = () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.onstatechange = () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              location.reload();
            }
          };
        };
      })
      .catch(console.warn);
  });
}

/*
  ⚠️ Footer:
  Garante que tens um botão para o novo ecrã:
  <a class="foot-item" href="#/objetivos" aria-label="Objetivos">
    <span class="foot-item__icon"></span>
    <span class="foot-item__label">Objetivos</span>
  </a>
*/
