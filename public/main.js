// main.js — Router SPA com base path dinâmico (localhost + GitHub Pages)
import { initAuth } from "./src/lib/auth.js";
import Guide from "./src/lib/guide.js";
import { loadTheme, applyTheme } from "./src/lib/theme.js";
import { Onboarding } from "./src/lib/onboarding.js";
import { Toast } from "./src/lib/ui.js";

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

function isAbortError(e) {
  const msg = String(e?.message || "");
  return (
    e?.name === "AbortError" ||
    msg.includes("aborted") ||
    msg.includes("signal is aborted")
  );
}

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

// Versão estática (sem cache-buster dinâmico) para aproveitar a cache do SW
const APPV = window.APP_VERSION || "v57";

const ROUTES = {
  "#/": {
    file: "/src/screens/dashboard.html",
    js: "/src/screens/dashboard.js",
    showFooter: true,
  },
  "#/transactions": {
    file: "/src/screens/Movimentos.html",
    js: "/src/screens/Movimentos.js",
    showFooter: true,
  },
  "#/movimentos": {
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
    file: "/src/screens/categories-v3.html",
    js: "/src/screens/categories.js",
    showFooter: true,
  },
  "#/health": {
    file: "/src/screens/health.html",
    js: "/src/screens/health.js",
    showFooter: true,
  },
  "#/metas": {
    file: "/src/screens/Metas.html",
    js: "/src/screens/Metas.js",
    showFooter: true,
  },
  "#/objetivos": {
    file: "/src/screens/Metas.html",
    js: "/src/screens/Metas.js",
    showFooter: true,
  },
};

function normalizeRoute(hash) {
  if (!hash || hash === "#" || hash === "#/") return "#/";
  // Normaliza para minúsculas para garantir match com as chaves de ROUTES
  const clean = hash.split("?")[0].toLowerCase();
  return ROUTES[clean] ? clean : "#/";
}

function setActiveTab() {
  const hash = normalizeRoute(location.hash || "#/");
  // Atualiza estado ativo no menu (footer)
  document.querySelectorAll(".foot-item").forEach((a) => {
    // Compara o href (ex. #/movimentos) com o hash normalizado
    const href = a.getAttribute("href").toLowerCase();
    a.toggleAttribute("aria-current", href === hash);
  });
}

let currentCleanup = null;

async function loadScreen(route) {
  const r = ROUTES[route] || ROUTES["#/"];

  // 1. Cleanup previous screen
  if (typeof currentCleanup === "function") {
    try {
      currentCleanup();
    } catch (e) {
      console.warn("Cleanup falhou:", e);
    }
    currentCleanup = null;
  }

  setStyle(outlet, { opacity: "0", transition: "opacity .15s ease" });
  await new Promise((res) => setTimeout(res, 90));

  try {
    // carrega HTML (sem cache-buster aleatório, usa versão da app)
    const htmlURL = `${resolveUrl(r.file)}?v=${APPV}`;
    const res = await fetch(htmlURL);
    // Nota: removemos cache: "no-store" para permitir que o SW sirva a versão cacheada se existir

    if (!res.ok)
      throw new Error(`Não encontrei ${r.file} (HTTP ${res.status})`);
    outlet.innerHTML = await res.text();

    // footer visível/oculto conforme rota
    if (footer) footer.style.display = r.showFooter ? "grid" : "none";

    // ativa tab corrente
    setActiveTab();

    // Atualiza o Guia Contextual
    Guide.setRoute(route);
    setTimeout(() => Guide.mountScreenButton(), 100); // ligeiro delay para garantir render

    // carrega controlador JS do ecrã
    if (r.js) {
      try {
        const jsURL = `${resolveUrl(r.js)}?v=${APPV}`;
        const mod = await import(jsURL);
        const fn = mod.init || mod.default;
        if (typeof fn === "function") {
          // 2. Init new screen and save cleanup
          const maybeCleanup = await fn({ sb: window.sb, outlet, route });
          if (typeof maybeCleanup === "function") currentCleanup = maybeCleanup;
        }
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

    // ✅ Mobile/PWA: aborts acontecem sem motivo "visível"
    if (isAbortError(e)) {
      // não assustar o user com "Erro na navegação"
      Toast.info("Ligação interrompida. A retomar…");

      // retry leve (1x) para evitar loops
      setTimeout(() => {
        // só tenta se não estiver já a navegar
        if (!routing) handleRoute();
      }, 500);

      return;
    }

    // erros reais continuam a aparecer
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

  // Carregar tema visual do utilizador
  if (window.sb) loadTheme(window.sb);

  // Em vez de pedir getSession de novo, carrega a rota atual diretamente
  loadScreen(normalizeRoute(location.hash || "#/")).catch((e) => {
    if (!isAbortError(e)) console.error(e);
  });

  // Show wizard if new user
  setTimeout(() => Onboarding.init(), 1000);
  Guide.mountHeaderButton();
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
    // Pré-carregar tema visual global (novo sistema)
    try {
      const visualSaved = JSON.parse(
        localStorage.getItem("wb:visuals") || "null",
      );
      if (visualSaved) applyTheme(visualSaved);
    } catch {}

    await waitForSupabase();
    initAuth({ onSignedIn, onSignedOut });
    window.addEventListener("hashchange", handleRoute);
    window.addEventListener("DOMContentLoaded", () => {
      setActiveTab();
      handleRoute();
    });
    window.dispatchEvent(new Event("app:ready"));

    // Service Worker Update Toasts
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        Toast.info("App atualizada! Recarregue se desejar.");
      });
    }

    // Network Status Toasts
    window.addEventListener("online", () =>
      Toast.success("Ligação recuperada 🟢"),
    );
    window.addEventListener("offline", () => Toast.error("Sem internet 🔴"));
  } catch (e) {
    console.error("Falha no arranque:", e);
  }
})();

