// src/lib/guide.js

// === SVG ICONS ===
const ICONS = {
  helpGeneric: () =>
    `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="guide-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 17.25h.007v.008H12v-.008z" /></svg>`,
  dashboard: () =>
    `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="guide-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>`,
  plus: () =>
    `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="guide-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>`,
  list: () =>
    `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="guide-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>`,
  tags: () =>
    `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="guide-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" /></svg>`,
  target: () =>
    `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="guide-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m-15.686 0A8.959 8.959 0 013 12c0-.778.099-1.533.284-2.253m0 0A11.959 11.959 0 013 12c0-.778.099-1.533.284-2.253m15.686 0A11.959 11.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918" /></svg>`,
  gear: () =>
    `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="guide-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.43.811 1.035.811 1.73 0 .695-.316 1.3-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" /></svg>`,
  heart: () =>
    `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="guide-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>`,
};

// === CONTENT ===
const CONTENT = {
  general: {
    icon: ICONS.helpGeneric(),
    title: "Guia Geral",
    what: [
      "Registar movimentos diários e fixos",
      "Analisar as tuas finanças (Dashboard)",
      "Organizar categorias e orçamentos",
    ],
    how: [
      "Usa o botão + para novos registos",
      "Navega no menu inferior para ver histórico e definições",
      "Toca nos cartões do Dashboard para ver detalhes",
    ],
    tips: ["Instala a app (PWA) para acesso offline e mais rápido."],
  },
  dashboard: {
    icon: ICONS.dashboard(),
    title: "Dashboard",
    what: [
      "Ver resumo: Receitas, Despesas, Poupança, Saldo",
      "Ver análises rápidas (mini-cards)",
      "Consultar próximas despesas e alertas",
    ],
    how: [
      "Toca nos cartões grandes para ver gráficos detalhados",
      "Desliza para ver os widgets inferiores",
    ],
    tips: [
      "Podes ocultar os mini-cards nas Definições se preferires um visual mais limpo.",
    ],
  },
  new: {
    icon: ICONS.plus(),
    title: "Novo Movimento",
    what: [
      "Registar Despesa, Receita, Poupança ou Transferência",
      "+ Despesas Rápidas: Registar várias despesas fixas de uma vez",
    ],
    how: [
      "Manual: escolhe tipo > data > valor > categoria > guardar",
      "Despesas Rápidas: abre a opção no topo, ajusta valores e confirma tudo",
    ],
    tips: [
      "Usa descrições consistentes para que a app sugira categorias automaticamente no futuro.",
    ],
  },
  transactions: {
    icon: ICONS.list(),
    title: "Movimentos",
    what: [
      "Ver histórico completo",
      "Filtrar por texto, data ou meio",
      "Editar ou apagar registos",
    ],
    how: [
      "Usa a barra de pesquisa ou os filtros no topo",
      "Carrega numa transação para editar os detalhes",
    ],
    tips: [
      "Se a categoria estiver errada, corrige-a aqui para melhorar a inteligência da app.",
    ],
  },
  categories: {
    icon: ICONS.tags(),
    title: "Categorias",
    what: [
      "Criar e organizar categorias Pai/Filho",
      "Definir se é despesa, receita ou poupança",
    ],
    how: [
      "Cria primeiro a categoria Pai, depois adiciona sub-categorias (Filhos)",
    ],
    tips: [
      "Evita criar muitos 'Outros'. Nomes específicos ajudam nos relatórios.",
    ],
  },
  goals: {
    icon: ICONS.target(),
    title: "Objetivos",
    what: ["Definir metas de poupança", "Acompanhar o progresso visualmente"],
    how: [
      "Cria um objetivo, define o valor alvo e associa a uma categoria de poupança",
    ],
    tips: [
      "Começa com objetivos pequenos e realistas para manter a motivação.",
    ],
  },
  settings: {
    icon: ICONS.gear(),
    title: "Definições",
    what: [
      "Criar Relatórios PDF (Anual/Mensal)",
      "Gerir Orçamentos",
      "Importar Extratos Bancários (PDF)",
    ],
    how: [
      "Relatórios: escolhe o período e exporta",
      "Orçamentos: define limites para cada categoria",
      "Importar: faz upload do PDF, valida os movimentos e confirma",
    ],
    tips: [
      "A importação de PDF funciona melhor com extratos mensais de texto (não digitalizados).",
    ],
  },
  health: {
    icon: ICONS.heart(),
    title: "Saúde Financeira",
    what: [
      "<strong><svg width='16' height='16' style='vertical-align: middle; margin-right: 4px;'><use href='#i-home'/></svg> Esforço Fixo</strong> (Meta < 40%): Percentagem do rendimento gasta em despesas fixas (renda, seguros).",
      "<strong><svg width='16' height='16' style='vertical-align: middle; margin-right: 4px;'><use href='#i-chart-down'/></svg> Esforço Total</strong> (Meta < 85%): Percentagem total do rendimento gasta (fixas + variáveis).",
      "<strong><svg width='16' height='16' style='vertical-align: middle; margin-right: 4px;'><use href='#i-piggy'/></svg> Taxa de Poupança</strong> (Meta ≥ 10%): Percentagem do rendimento que consegues poupar.",
      "<strong><svg width='16' height='16' style='vertical-align: middle; margin-right: 4px;'><use href='#i-cash'/></svg> Liquidez</strong>: Dinheiro disponível acumulado e tendência dos últimos meses.",
      "<strong><svg width='16' height='16' style='vertical-align: middle; margin-right: 4px;'><use href='#i-target'/></svg> Saldos Negativos</strong> (Meta: 0): Número de meses consecutivos com saldo negativo.",
      "<strong><svg width='16' height='16' style='vertical-align: middle; margin-right: 4px;'><use href='#i-chart-line'/></svg> Regularidade</strong>: Identifica se as despesas são estáveis ou irregulares.",
    ],
    how: [
      "Consulta o teu <strong>Score de Saúde</strong> no topo para uma visão rápida",
      "Usa os <strong>filtros por cima do gráfico</strong> para ver cada indicador nos últimos 12 meses",
      "Analista os <strong>Alertas</strong> no fundo para conselhos práticos de melhoria",
    ],
    tips: [
      "Clica no botão de ajuda no header para ver este guia a qualquer momento.",
    ],
  },
};

// === STATE ===
const state = {
  currentRouteKey: "dashboard", // default
};

// === LOGIC ===
function getRouteKey(route) {
  if (!route) return "dashboard";
  if (route.includes("new") || route.includes("nova")) return "new";
  if (route.includes("movimentos") || route.includes("transactions"))
    return "transactions";
  if (route.includes("categories")) return "categories";
  if (route.includes("metas") || route.includes("objetivos")) return "goals";
  if (route.includes("settings")) return "settings";
  if (route.includes("health")) return "health";
  return "dashboard";
}

function renderSection(key, data, isContextual) {
  return `
    <section id="guide-sec-${key}" class="guide-section ${isContextual ? "highlight" : ""}">
      <div class="guide-sec-header">
        <span class="guide-sec-icon">${data.icon}</span>
        <h3>${data.title}</h3>
      </div>
      
      <div class="guide-block">
        <h4>O que podes fazer</h4>
        <ul>${data.what.map((i) => `<li>${i}</li>`).join("")}</ul>
      </div>

      <div class="guide-block">
        <h4>Como se faz</h4>
        <ul>${data.how.map((i) => `<li>${i}</li>`).join("")}</ul>
      </div>

      ${
        data.tips && data.tips.length
          ? `
      <div class="guide-tips">
        <strong><svg width='16' height='16' style='vertical-align: middle; margin-right: 4px;'><use href='#i-crystal'/></svg> Dica:</strong>
        <ul>${data.tips.map((i) => `<li>${i}</li>`).join("")}</ul>
      </div>`
          : ""
      }
    </section>
  `;
}

function ensureModal() {
  if (document.getElementById("guide-modal")) return;

  const modal = document.createElement("div");
  modal.id = "guide-modal";
  modal.className = "guide-modal hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-labelledby", "guide-title");
  modal.setAttribute("aria-modal", "true");

  modal.innerHTML = `
    <div class="guide-card">
      <div class="guide-header">
        <h2 id="guide-title">
          ${ICONS.helpGeneric()} Guia da Aplicação
        </h2>
        <button id="guide-close" aria-label="Fechar Guia" class="icon-btn">✕</button>
      </div>
      <div class="guide-content" id="guide-content" tabindex="-1"></div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event Listeners
  const closeBtn = modal.querySelector("#guide-close");
  const closeFn = () => closeModal();

  closeBtn.addEventListener("click", closeFn);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeFn();
  });

  // ESC key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      closeFn();
    }
  });
}

function render(filterKey = null) {
  const container = document.getElementById("guide-content");
  if (!container) return;

  let html = "";

  if (filterKey) {
    // Contextual: Show only specific section
    const data = CONTENT[filterKey];
    if (data) {
      html += renderSection(filterKey, data, true);
    } else {
      // Fallback to general if key not found
      html += renderSection("general", CONTENT.general, true);
    }
  } else {
    // Global: Show General + All Sections
    html += renderSection("general", CONTENT.general, false);
    Object.keys(CONTENT).forEach((key) => {
      if (key !== "general") {
        html += renderSection(key, CONTENT[key], false);
      }
    });
  }

  container.innerHTML = html;
}

function openModal(mode = "GLOBAL") {
  ensureModal();
  const modal = document.getElementById("guide-modal");

  if (mode === "CONTEXT") {
    render(state.currentRouteKey);
  } else {
    // Global
    render(null);
    // Auto-scroll to current section
    setTimeout(() => {
      const el = document.getElementById(`guide-sec-${state.currentRouteKey}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  modal.classList.remove("hidden");

  // Focus trap (simple)
  setTimeout(() => {
    const closeBtn = modal.querySelector("#guide-close");
    if (closeBtn) closeBtn.focus();
  }, 50);
}

function closeModal() {
  const modal = document.getElementById("guide-modal");
  modal?.classList.add("hidden");
}

class Guide {
  static setRoute(route) {
    state.currentRouteKey = getRouteKey(route);
  }

  static mountHeaderButton() {
    const header = document.querySelector(".app-header__inner");
    if (!header || document.getElementById("guide-btn-global")) return;

    const btn = document.createElement("button");
    btn.id = "guide-btn-global";
    btn.className = "guide-btn";
    btn.title = "Guia da Aplicação (Geral)";
    btn.innerHTML = ICONS.helpGeneric(); // Use generic SVG
    btn.addEventListener("click", () => openModal("GLOBAL"));

    // Insert before the last item or append
    header.appendChild(btn);
  }

  static mountScreenButton() {
    // Idempotency: prevent duplicates
    const existing = document.querySelector(".screen-help-btn");
    if (existing) existing.remove(); // Clean up old one to be safe or just return if we want persistence

    // Finding injection point
    let target =
      document.querySelector(".screen-header") ||
      document.querySelector(".section-title") ||
      document.querySelector(".card .card-header");

    // Fallback: Outlet top
    let injectMethod = "append";
    if (!target) {
      target = document.getElementById("outlet");
      injectMethod = "prepend";
    }

    if (!target) return; // Should not happen

    const btn = document.createElement("button");
    btn.className = "screen-help-btn";
    btn.title = "Ajuda deste ecrã";
    btn.innerHTML = `<span>?</span> Ajuda`;

    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // prevent card collapse etc
      openModal("CONTEXT");
    });

    if (injectMethod === "prepend") {
      target.prepend(btn);
    } else {
      target.appendChild(btn);
    }
  }
}

export default Guide;
