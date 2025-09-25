// main.js
import { initAuth } from "./src/auth.js";

const sb = window.sb;
const outlet = document.getElementById("outlet");
const footer = document.getElementById("app-footer");

// Rotas (ajusta caminhos conforme as tuas pastas)
const ROUTES = {
  "#/": {
    file: "src/screens/dashboard.html",
    js: "src/screens/dashboard.js",
    showFooter: true,
  },
  "#/transactions": {
    file: "src/screens/transactions.html",
    js: "src/screens/transactions.js",
    showFooter: true,
  },
  "#/new": {
    file: "src/screens/nova.html",
    js: "src/screens/nova.js",
    showFooter: true,
  },
  "#/settings": {
    file: "src/screens/settings.html",
    js: "src/screens/settings.js",
    showFooter: true,
  },
};

function setActiveTab() {
  const hash = location.hash || "#/";
  document.querySelectorAll(".foot-item").forEach((a) => {
    const href = a.getAttribute("href") || "";
    a.toggleAttribute("aria-current", hash.startsWith(href));
  });
}

async function loadScreen(route) {
  const r = ROUTES[route] || ROUTES["#/"];

  // 1) carrega HTML parcial
  const res = await fetch(r.file, { cache: "no-store" });
  if (!res.ok) throw new Error(`Não encontrei ${r.file} (HTTP ${res.status})`);
  outlet.innerHTML = await res.text();

  // 2) footer + tab ativa
  footer.style.display = r.showFooter ? "flex" : "none";
  setActiveTab();

  // 3) JS do ecrã (se existir)
  if (r.js) {
    const mod = await import(`./${r.js}?v=${Date.now()}`);
    if (typeof mod.init === "function") await mod.init({ sb, outlet });
    else if (typeof mod.default === "function")
      await mod.default({ sb, outlet });
  }
}

let routing = false;
async function handleRoute() {
  if (routing) return; // evita reentrâncias
  routing = true;
  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    const route = location.hash || "#/";
    if (!session) {
      outlet.innerHTML = "";
      footer.style.display = "none";
    } else {
      await loadScreen(route);
    }
  } catch (e) {
    console.error(e);
    outlet.innerHTML = `<div class="card">
      <strong>Erro ao carregar o ecrã.</strong><br/>
      <small>${String(e && e.message ? e.message : e)}</small>
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

// Service Worker — desliga em dev para não cachear ficheiros
if (
  "serviceWorker" in navigator &&
  !["localhost", "127.0.0.1"].includes(location.hostname)
) {
  navigator.serviceWorker.register("./sw.js").catch(console.warn);
}
