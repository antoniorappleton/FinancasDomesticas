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
  const base = hash.split("?")[0].split("/")[1] || ""; // "" para "#/"
  const current = base ? `#/${base}` : "#/";

  document.querySelectorAll(".foot-item").forEach((a) => {
    const href = a.getAttribute("href") || "";
    a.toggleAttribute("aria-current", href === current);
  });
}


async function loadScreen(route) {
  const r = ROUTES[route] || ROUTES["#/"];

  // 1) carrega HTML parcial
  const res = await fetch(r.file, { cache: "no-store" });
  if (!res.ok) throw new Error(`Não encontrei ${r.file} (HTTP ${res.status})`);
  outlet.innerHTML = await res.text();

  // 2) footer + tab ativa
  footer.style.display = r.showFooter ? "grid" : "none";
  setActiveTab();


  // dentro de loadScreen(route)
  // 3) carrega JS do ecrã
  if (r.js) {
    try {
      const mod = await import(`./${r.js}?v=${Date.now()}`);
      const fn = mod.init || mod.default;
      if (typeof fn === "function") await fn({ sb, outlet });
    } catch (e) {
      console.error("Falha ao importar", r.js, e);
      throw new Error(`Falha a carregar ${r.js}: ${String(e && e.message ? e.message : e)}`);
    }
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

// SW: só em produção (https e não localhost/127.x)
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/^127\.|^localhost$/.test(location.hostname)) {
  navigator.serviceWorker.register('/sw.js')
    .then(() => console.log('SW registado'))
    .catch(err => console.log('SW erro:', err));
} else if ('serviceWorker' in navigator) {
  // Dev: remove SWs antigos
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
}

