// main.js
import { initAuth } from "./src/auth.js";


const sb = window.sb;
const outlet = document.getElementById("outlet");
const footer = document.getElementById("app-footer");

// ⚠️ Usa os caminhos onde ESTÃO MESMO os teus ficheiros.
// Se os teus ficheiros estão em "screens/" (sem src), muda aqui.
const ROUTES = {
  "#/":            { file: "src/screens/dashboard.html", js: "src/screens/dashboard.js", showFooter: true },
  "#/transactions":{ file: "src/screens/transactions.html", js: "src/screens/transactions.js", showFooter: true },
  "#/new":         { file: "src/screens/nova.html",       js: "src/screens/nova.js",       showFooter: true },
  "#/settings":    { file: "src/screens/settings.html",   js: "src/screens/settings.js",   showFooter: true }
};


function setActiveTab() {
  const hash = location.hash || "#/";
  document.querySelectorAll(".foot-item").forEach(a => {
    a.toggleAttribute("aria-current", hash.startsWith(a.getAttribute("href")));
  });
}

async function loadScreen(route) {
  const r = ROUTES[route] || ROUTES["#/"];

  // 1) carrega HTML parcial
  const res = await fetch(r.file, { cache: "no-store" });
  if (!res.ok) throw new Error(`Não encontrei ${r.file} (HTTP ${res.status})`);
  outlet.innerHTML = await res.text();

  // 2) mostra/esconde footer + estado ativo
  footer.style.display = r.showFooter ? "flex" : "none";
  setActiveTab();

  // 3) importa JS do ecrã, se existir
  if (r.js) {
    const mod = await import(`./${r.js}?v=${Date.now()}`);
    if (typeof mod.init === "function") await mod.init({ sb, outlet });
    else if (typeof mod.default === "function") await mod.default({ sb, outlet });
  }
}

export async function handleRoute() {
  const { data:{ session } } = await sb.auth.getSession();
  const route = location.hash || "#/";
  if (!session) {
    outlet.innerHTML = "";
    footer.style.display = "none";
    return;
  }
  try {
    await loadScreen(route);
  } catch (e) {
    console.error(e);
    outlet.innerHTML = `<div class="card">
      <strong>Erro ao carregar o ecrã.</strong><br>
      <small>${String(e.message || e)}</small>
    </div>`;
  }
}

window.addEventListener("hashchange", () => { handleRoute(); });
window.addEventListener("DOMContentLoaded", () => { handleRoute(); setActiveTab(); });

initAuth({
  onSignedIn: handleRoute,
  onSignedOut: () => { outlet.innerHTML = ""; footer.style.display = "none"; },
});
