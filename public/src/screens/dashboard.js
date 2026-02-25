// src/screens/dashboard.js
// -----------------------------------------------------------------------------
// Dashboard resiliente (com/sem Supabase) + mini-cards (modal)
// - Chart.js on-demand
// - Tooltips monetários robustos (vertical/horizontal/line/pie)
// - Botão colapsar com SVG inline
// - Mini-card "Gasto diário" azul (acumulado) e rosa (previsão)
// -----------------------------------------------------------------------------
import {
  money,
  pad2,
  ymd,
  movingAverage,
  monthKeysBetween,
  palette,
  CHART_COLORS,
  axisMoney,
  toolMoney,
  ensureChartStack,
} from "../lib/helpers.js";
import { repo } from "../lib/repo.js";
import { trapFocus } from "../lib/helpers.js";
import { Toast, Modal } from "../lib/ui.js";

import {
  calculateRoutineFixedAverage,
  projectCashflow,
} from "../lib/analytics.js";
import { loadTheme } from "../lib/theme.js";

// ===================== Mini-cards + Modal (Chart.js) =====================
function setupDashboardModal(ds, rawData) {
  const modal = document.getElementById("dash-modal");
  const titleEl = document.getElementById("dash-modal-title");
  const canvas = document.getElementById("dash-modal-canvas");
  const extraEl = document.getElementById("dash-modal-extra");
  const btnX = modal?.querySelector(".modal__close");
  const btnClose = document.getElementById("dash-modal-close");
  let chart;

  const open = () => {
    modal.hidden = false;
    trapFocus(modal);
  };

  const close = () => {
    modal.hidden = true;
    extraEl.innerHTML = "";
    if (chart) {
      chart.destroy();
      chart = null;
    }
    // Return focus
    document.getElementById("dash-modal-open")?.focus();
  };
  btnX?.addEventListener("click", close);

  btnClose?.addEventListener("click", close);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  const mount = (cfg) => {
    if (chart) chart.destroy();
    chart = new Chart(canvas.getContext("2d"), cfg);
  };

  // ---------- Renderers ----------
  // ---------- Helpers para Ajustes Manuais (Dynamic Year) ----------
  function loadFixedSettings(year) {
    try {
      return JSON.parse(localStorage.getItem(`wb:fixed:${year}`) || "{}");
    } catch {
      return {};
    }
  }

  function saveFixedSettings(year, obj) {
    localStorage.setItem(`wb:fixed:${year}`, JSON.stringify(obj || {}));
  }

  function rebuildSeriesWithOverrides(settings) {
    // 1. Recover raw transactions from scope (we need them for Annual check)
    // IMPORTANT: 'monthly' and 'allHistoryMap' are built from VIEW usually.
    // But 'dashboard.js' logic doesn't expose raw TXs globally easily unless we saved them.
    // HACK: We will try to rely on 'thisMonthAgg' or 'fixedCashflowByMonth' if they had granularity, but they don't.
    // ADJUSTMENT: We will assume for now that if we are using the VIEW path, we might miss Annual details unless we fetch them.
    // However, the user wants this. We can scan 'allHistoryMap' but that's already aggregated.
    // To properly support "Separating Annuals", we need to know which part of 'expense' is Annual.
    // For this Turn, we will use a naive approach: If we don't have raw data, we assume 0 Annuals (Smoothing applies to total).
    // IF we have raw data (fallback path), we could do it.
    // Let's implement a 'annualFixedByMonth' map that we populate during the Data Fetch phase if possible.

    // We will update Data Fetching below to populate 'annualFixedByMonth'.
    const { allHistoryMap, fixedVarByMonth, annualFixedByMonth } =
      rawData || {};
    const targetYear = String(new Date().getFullYear());
    const now = new Date();

    const currentMonthKey = `${targetYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Calculate YTD Routine Average
    const routineAvg = calculateRoutineFixedAverage(
      fixedVarByMonth,
      annualFixedByMonth,
      targetYear,
      currentMonthKey,
    );

    // Project
    return projectCashflow(
      targetYear,
      allHistoryMap,
      fixedVarByMonth,
      annualFixedByMonth,
      settings,
      routineAvg,
    );
  }

  // ---------- Renderers ----------
  function renderCashflow() {
    const targetYear = String(new Date().getFullYear());
    titleEl.textContent = `Previsão de Saldo ${targetYear} (Contas Fixas)`;

    // 1) Lê settings e constrói séries (com/sem override)
    // 1) Lê settings e constrói séries (com/sem override)
    // rawData is already available in closure and contains the maps we need

    const settings = loadFixedSettings(targetYear);
    const series = rebuildSeriesWithOverrides(settings);

    // 2) Monta/atualiza Chart
    mount({
      type: "bar",
      data: {
        labels: series.labels,
        datasets: [
          // --- BARS ---
          {
            type: "bar",
            label: "Sobra (Fixas)",
            data: series.netFixed,
            backgroundColor: (ctx) => (ctx.raw < 0 ? "#ef4444" : "#22c55e"),
            order: 3,
            stack: "fixed",
            barPercentage: 0.6,
          },
          {
            type: "bar",
            label: "Sobra Real",
            data: series.netTotal,
            backgroundColor: "#94a3b8", // Grey for total context
            order: 4,
            stack: "total",
            barPercentage: 0.6,
            hidden: false,
          },
          // --- LINES ---
          {
            type: "line",
            label: "Acumulado Anual (Fixas)",
            data: series.cumFixed,
            borderColor: "#3b82f6", // Blue
            borderWidth: 2,
            tension: 0.25,
            fill: false,
            order: 1,
          },
          {
            type: "line",
            label: "Acumulado Anual (Real)",
            data: series.cumTotal,
            borderColor: "#64748b", // Slate
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.25,
            fill: false,
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" }, tooltip: toolMoney },
        scales: { y: { ...axisMoney, beginAtZero: false } },
      },
    });

    // 3) Render UI (painel de ajustes) no extraEl
    const settingsKey = `wb:fixed:${targetYear}:open`;
    const isPanelOpen = localStorage.getItem(settingsKey) === "1";
    const chevronDown = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    const chevronUp = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;

    extraEl.innerHTML = `
      <div class="muted" style="margin-bottom:8px">
        <strong>Previsão de Saldo ${targetYear}:</strong><br>
        • <span style="color:#22c55e">■</span> Liquido só com Despesas Fixas: Entradas - Despesas Fixas.<br>
        • <span style="color:#94a3b8">■</span> Liquido Real: Entradas - Despesas (Fixas e Variáveis).<br>
        (Futuro c/base no histórico do ano anterior)
      </div>
      
      <div style="margin-top:4px; border-top:1px solid var(--border); padding-top:4px;">
        <button id="fx26-toggle" class="btn btn--ghost" style="width:100%; display:flex; justify-content:space-between; align-items:center; padding: 6px 4px; font-size:0.9rem; font-weight:600; color:var(--text);">
          <span>Ajuste o gráfico com algumas despesas fixas para este ano que não tinha antes</span>
          <span id="fx26-icon">${isPanelOpen ? chevronUp : chevronDown}</span>
        </button>

        <div id="fx26-container" ${isPanelOpen ? "" : "hidden"} style="margin-top:6px;">
          <fieldset id="fx26-panel" class="panel" style="border:1px solid var(--border); padding:10px; border-radius:8px; background:var(--surface-2);">
            <label style="display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer;">
              <input type="checkbox" id="fx26-enabled">
              <span style="font-weight:500;">Ativar ajustes manuais</span>
            </label>
            
            <div id="fx26-inputs" class="grid" style="display:grid; grid-template-columns: 1fr auto; gap:8px; max-width:400px; margin-top:8px; align-items:center;">
              <label for="fx26-rent" style="font-size:0.9rem">Renda</label> 
              <input id="fx26-rent" type="number" min="0" step="1" style="width:100px; padding:4px;">
              
              <label for="fx26-uti" style="font-size:0.9rem">Água + Luz + Internet</label> 
              <input id="fx26-uti" type="number" min="0" step="1" style="width:100px; padding:4px;">
              
              <label for="fx26-oth" style="font-size:0.9rem">Outras obrigatórias</label> 
              <input id="fx26-oth" type="number" min="0" step="1" style="width:100px; padding:4px;">
            </div>
            
            <div class="actions" style="margin-top:12px; display:flex; gap:8px;">
              <button class="btn btn--sm" id="fx26-apply">Recalcular projeção</button>
              <button class="btn btn--ghost btn--sm" id="fx26-reset">Repor padrão</button>
            </div>
          </fieldset>
        </div>
      </div>
    `;

    // 4) Inicializar estado dos inputs
    const toggleBtn = extraEl.querySelector("#fx26-toggle");
    const container = extraEl.querySelector("#fx26-container");
    const iconEl = extraEl.querySelector("#fx26-icon");

    const enabledEl = extraEl.querySelector("#fx26-enabled");
    const rentEl = extraEl.querySelector("#fx26-rent");
    const utiEl = extraEl.querySelector("#fx26-uti");
    const othEl = extraEl.querySelector("#fx26-oth");
    const applyBtn = extraEl.querySelector("#fx26-apply");
    const resetBtn = extraEl.querySelector("#fx26-reset");

    // Toggle logic
    toggleBtn.addEventListener("click", () => {
      const isHidden = container.hidden;
      container.hidden = !isHidden;
      iconEl.innerHTML = !isHidden ? chevronDown : chevronUp;
      localStorage.setItem(settingsKey, !isHidden ? "1" : "0");
    });

    // mapear settings -> inputs
    const mapToInputs = (set) => {
      enabledEl.checked = !!set?.enabled;
      const get = (label) =>
        (set?.items || []).find((i) => (i.label || "").toLowerCase() === label);
      rentEl.value = Number(get("renda")?.amount || 0);
      utiEl.value = Number(get("água + luz + internet")?.amount || 0);
      othEl.value = Number(get("outros")?.amount || 0);
    };

    mapToInputs(settings);

    function buildSettingsFromInputs() {
      const en = enabledEl.checked;
      const items = [
        {
          label: "Renda",
          amount: Number(rentEl.value || 0),
          months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        },
        {
          label: "Água + Luz + Internet",
          amount: Number(utiEl.value || 0),
          months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        },
        {
          label: "Outros",
          amount: Number(othEl.value || 0),
          months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        },
      ];
      return { enabled: en, items };
    }

    function updateChart() {
      const newSet = buildSettingsFromInputs();
      saveFixedSettings(targetYear, newSet);
      mapToInputs(newSet); // Refresh inputs/state if needed
      const s = rebuildSeriesWithOverrides(newSet);

      chart.data.labels = s.labels;
      chart.data.datasets[0].data = s.netFixed; // barra fixed
      chart.data.datasets[2].data = s.cumFixed; // linha cum fixed
      chart.data.datasets[1].data = s.netTotal; // barra total
      chart.data.datasets[3].data = s.cumTotal; // linha cum total
      chart.update();
    }

    applyBtn.addEventListener("click", updateChart);
    // Auto update on checkbox toggle
    enabledEl.addEventListener("change", () => updateChart());

    // Allow Enter key to submit in inputs
    [rentEl, utiEl, othEl].forEach((el) => {
      el.addEventListener("keypress", (e) => {
        if (e.key === "Enter") updateChart();
      });
    });

    resetBtn.addEventListener("click", () => {
      localStorage.removeItem(`wb:fixed:${targetYear}`);
      mapToInputs({});
      updateChart();
    });
  }

  function renderTendencias() {
    titleEl.textContent = "Tendências (12 meses + previsão próxima)";

    const labels = [...(ds.labels12m || [])];
    if (labels.length) {
      labels[labels.length - 1] += " (atual)";
    }
    const inc = ds.income12m ? [...ds.income12m] : [];
    const exp = ds.expense12m ? [...ds.expense12m].map(Math.abs) : [];
    const sav = ds.savings12m ? [...ds.savings12m].map(Math.abs) : [];
    const saldoReal =
      ds.saldo12m && ds.saldo12m.length
        ? [...ds.saldo12m]
        : inc.map((_, i) => (inc[i] || 0) - (exp[i] || 0) - (sav[i] || 0));

    // Previsão customizada (User Refined 80/20)
    // Entradas/Poupanças: média 12 meses (incluindo o corrente)
    const incF = movingAverage(inc, 12);
    const savF = movingAverage(sav, 12);

    // Saídas: 80% média últimos 2 meses (inclui corrente) + 20% média meses 4 a 9 (pula mês 3)
    const avg2 = movingAverage(exp, 2);
    const avg4_9 = movingAverage(exp.slice(0, -3), 6);
    const expF = 0.8 * avg2 + 0.2 * avg4_9;

    const saldoF = incF - expF - savF;

    const last = labels.length ? new Date(labels.at(-1) + "-01") : new Date();
    const next = new Date(last.getFullYear(), last.getMonth() + 1, 1);
    const pt = next
      .toLocaleDateString("pt-PT", { month: "short", year: "2-digit" })
      .replace(".", "");
    const nextLabel = pt.charAt(0).toUpperCase() + pt.slice(1) + " *";

    // Construção dos datasets (histórico a cores; previsão translúcida)
    const baseData = {
      labels: [...labels, nextLabel],
      datasets: [
        {
          type: "bar",
          label: "Entradas",
          data: [...inc, null],
          backgroundColor: CHART_COLORS.inc,
          borderColor: CHART_COLORS.inc,
          borderWidth: 1,
        },
        {
          type: "bar",
          label: "Saídas",
          data: [...exp, null],
          backgroundColor: CHART_COLORS.exp,
          borderColor: CHART_COLORS.exp,
          borderWidth: 1,
        },
        {
          type: "bar",
          label: "Poupanças",
          data: [...sav, null],
          backgroundColor: CHART_COLORS.sav,
          borderColor: CHART_COLORS.sav,
          borderWidth: 1,
        },

        // barras previsão
        {
          type: "bar",
          label: "Entradas (prev.)",
          data: Array(labels.length).fill(null).concat(incF),
          backgroundColor: CHART_COLORS.incF,
          borderColor: CHART_COLORS.inc,
          borderWidth: 2,
        },
        {
          type: "bar",
          label: "Saídas (prev.)",
          data: Array(labels.length).fill(null).concat(expF),
          backgroundColor: CHART_COLORS.expF,
          borderColor: CHART_COLORS.exp,
          borderWidth: 2,
        },
        {
          type: "bar",
          label: "Poupanças (prev.)",
          data: Array(labels.length).fill(null).concat(savF),
          backgroundColor: CHART_COLORS.savF,
          borderColor: CHART_COLORS.sav,
          borderWidth: 2,
        },

        // Linha do saldo
        {
          type: "line",
          label: "Sobra",
          data: [...saldoReal, saldoF],
          borderColor: CHART_COLORS.saldo,
          borderWidth: 2,
          tension: 0.25,
          fill: false,
          segment: {
            borderDash: (ctx) =>
              ctx.p0DataIndex >= labels.length - 1 ? [6, 4] : [],
          },
          pointRadius: (ctx) => (ctx.dataIndex === labels.length ? 3 : 0),
          pointHoverRadius: 4,
          pointBackgroundColor: (ctx) =>
            ctx.dataIndex === labels.length ? "#fff" : CHART_COLORS.saldo,
          pointBorderColor: CHART_COLORS.saldo,
        },
      ],
    };

    mount({
      data: baseData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom" },
          tooltip: toolMoney,
        },
        scales: {
          x: { stacked: false },
          y: { ...axisMoney, beginAtZero: true },
        },
      },
    });

    extraEl.innerHTML = `<div class="muted">
    A linha a tracejado é previsão: Entradas (média 12m), Saídas (80% últimos 2m + 20% meses 4-9).
  </div>`;

    // (Opcional) Fixas vs Variáveis previsto
    const fixed = ds.fixed12m || [];
    const variable = ds.variable12m || [];
    if (fixed.length && variable.length) {
      // Usar média 12 meses para consistência nestes detalhes
      const avgFixed = movingAverage(fixed, 12),
        avgVar = movingAverage(variable, 12);
      const tot = avgFixed + avgVar || 1;
      const pf = ((avgFixed / tot) * 100).toFixed(1);
      const pv = ((avgVar / tot) * 100).toFixed(1);

      extraEl.innerHTML += `
      <div class="rpt-legend" style="margin-top:8px">
        <div class="rpt-legend__item"><span style="flex:1">Obrigatórias (prev.)</span><strong>${money(
          avgFixed,
        )}</strong><span class="muted">&nbsp;(${pf}%)</span></div>
        <div class="rpt-legend__item"><span style="flex:1">Extras (prev.)</span><strong>${money(
          avgVar,
        )}</strong><span class="muted">&nbsp;(${pv}%)</span></div>
      </div>`;
    }
  }

  function renderFixVarMes() {
    titleEl.textContent = "Obrigatórias vs Extras (mês atual)";
    const total = (ds.fixasMes || 0) + (ds.variaveisMes || 0) || 1;
    mount({
      type: "doughnut",
      data: {
        labels: ["Obrigatórias", "Extras"],
        datasets: [{ data: [ds.fixasMes || 0, ds.variaveisMes || 0] }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (c) =>
                `${c.label}: ${money(c.parsed)} (${(
                  (c.parsed / total) *
                  100
                ).toFixed(1)}%)`,
            },
          },
        },
      },
    });
    const fix = ds.fixasMes || 0,
      vari = ds.variaveisMes || 0;
    extraEl.innerHTML = `<div class="rpt-legend__item"><span style="flex:1">Obrigatórias</span><strong>${money(
      fix,
    )}</strong>
        <span class="muted">&nbsp;(${((fix / (fix + vari || 1)) * 100).toFixed(
          1,
        )}%)</span></div>
       <div class="rpt-legend__item"><span style="flex:1">Extras</span><strong>${money(
         vari,
       )}</strong>
        <span class="muted">&nbsp;(${((vari / (fix + vari || 1)) * 100).toFixed(
          1,
        )}%)</span></div>`;
  }

  function renderFixVar12m() {
    titleEl.textContent = "Obrigatórias vs Extras (12 meses)";
    const labels = ds.labels12m || [];
    const fixed = ds.fixed12m || [];
    const variable = ds.variable12m || [];
    const hasRealFV =
      fixed.length === labels.length &&
      variable.length === labels.length &&
      labels.length > 0;

    const datasets = hasRealFV
      ? [
          { label: "Obrigatórias", data: fixed, stack: "fv" },
          { label: "Extras", data: variable, stack: "fv" },
        ]
      : [
          {
            label: "Saídas (aprox.)",
            data: (ds.expense12m || []).map(Math.abs),
            stack: "exp",
          },
          {
            label: "Poupanças",
            data: (ds.savings12m || []).map(Math.abs),
            stack: "exp",
          },
        ];

    mount({
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" }, tooltip: toolMoney },
        scales: {
          x: { stacked: true },
          y: { ...axisMoney, stacked: true, beginAtZero: true },
        },
      },
    });

    extraEl.innerHTML = hasRealFV
      ? ""
      : `<div class="muted">Sem séries Fixas/Variáveis por mês — a mostrar aproximação (Despesas + Poupanças).</div>`;
  }

  function renderCategorias() {
    titleEl.textContent = "Distribuição de Despesas (últimos 12 meses)";
    const total = (ds.parentValues || []).reduce((a, b) => a + b, 0) || 1;
    mount({
      type: "pie",
      data: {
        labels: ds.parentLabels || [],
        datasets: [{ data: ds.parentValues || [] }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: { usePointStyle: true, boxWidth: 8 },
          },
          tooltip: {
            callbacks: {
              label: (tt) =>
                `${tt.label}: ${money(tt.parsed)} (${(
                  (tt.parsed / total) *
                  100
                ).toFixed(1)}%)`,
            },
          },
        },
      },
    });
  }

  function renderTopCategorias() {
    titleEl.textContent = "Onde gastei mais (mês atual)";
    const pairs = (ds.catLabelsMes || []).map((name, i) => [
      name,
      (ds.catValuesMes || [])[i] || 0,
    ]);
    const top = pairs.sort((a, b) => b[1] - a[1]).slice(0, 8);
    const labels = top.map((x) => x[0]);
    const vals = top.map((x) => x[1]);

    mount({
      type: "bar",
      data: { labels, datasets: [{ label: "Total", data: vals }] },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: toolMoney },
        scales: { x: { ...axisMoney, beginAtZero: true } },
      },
    });
  }

  function renderGastoDiario() {
    titleEl.textContent = "Gasto diário acumulado (mês atual)";
    const labels = ds.dailyLabels || [];
    const real = ds.dailyCumReal || [];
    const forecast = ds.dailyCumForecast || [];

    mount({
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Acumulado",
            data: real,
            fill: false,
            tension: 0.25,
            borderColor: "#1d4ed8",
            backgroundColor: "rgba(29,78,216,0.18)",
          },
          {
            label: "Previsão (mês)",
            data: forecast,
            fill: true,
            tension: 0.25,
            borderDash: [6, 4],
            borderColor: "#ec4899",
            backgroundColor: "rgba(236,72,153,0.18)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" }, tooltip: toolMoney },
        scales: { y: { ...axisMoney, beginAtZero: true } },
      },
    });
  }

  function renderMetodos() {
    titleEl.textContent = "Uso de métodos de pagamento (4 meses)";
    const labs = ds.methodsLabels || [];
    const vals = ds.methodsValues || [];
    mount({
      type: "bar",
      data: { labels: labs, datasets: [{ label: "Total", data: vals }] },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: toolMoney },
        scales: { x: { ...axisMoney, beginAtZero: true } },
      },
    });
  }

  function renderRegularidades() {
    titleEl.textContent = "Saídas por Frequência (mês atual)";
    const labels = ds.regLabelsMes || [];
    const values = ds.regTotalsMes || [];
    const total = values.reduce((a, b) => a + b, 0) || 1;

    mount({
      type: "bar",
      data: { labels, datasets: [{ label: "Total (€)", data: values }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" }, tooltip: toolMoney },
        scales: { y: { ...axisMoney, beginAtZero: true } },
      },
    });

    const html = labels
      .map((lab, i) => {
        const v = values[i] || 0;
        const p = ((v / total) * 100).toFixed(1);
        return `<div class="rpt-legend__item"><span style="flex:1">${lab}</span><strong>${money(
          v,
        )}</strong><span class="muted">&nbsp;(${p}%)</span></div>`;
      })
      .join("");
    document.getElementById("dash-modal-extra").innerHTML = html;
  }

  async function renderInvestimentos() {
    titleEl.textContent = "Investimentos por categoria (valor atual)";
    const agg = await repo.portfolios.aggregate();
    const labels = agg.kinds;
    const dataNow = labels.map((k) => agg.byKind.get(k)?.current || 0);
    // USED HELPER PALETTE
    const pal = palette(labels.length);

    mount({
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Valor atual", data: dataNow, backgroundColor: pal },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: toolMoney },
        scales: { y: { ...axisMoney, beginAtZero: true } },
        onClick: (_, elements) => {
          if (!elements?.length) return;
          const idx = elements[0].index;
          const kind = labels[idx];
          const invested = agg.byKind.get(kind)?.invested || 0;
          const projected = agg.byKind.get(kind)?.projected || 0;
          chart.data.labels = ["Investido", "Projetado (12m)"];
          chart.data.datasets = [
            {
              label: kind,
              data: [invested, projected],
              backgroundColor: ["#94a3b8", pal[idx]],
            },
          ];
          chart.options.plugins.legend.display = true;
          chart.update();
          titleEl.textContent = `Investimentos · ${kind}`;
        },
      },
    });
  }

  const handlers = {
    cashflow: renderCashflow,
    tendencias: renderTendencias,
    fixvar_mes: renderFixVarMes,
    fixvar_12m: renderFixVar12m,
    categorias: renderCategorias,
    top_categorias: renderTopCategorias,
    gasto_diario: renderGastoDiario,
    metodos: renderMetodos,
    regularidades: renderRegularidades,
    investimentos: renderInvestimentos,
  };
  handlers.gasto_diario_acum = renderGastoDiario;

  document.querySelectorAll(".mini-card[data-chart]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fn = handlers[btn.dataset.chart];
      if (!fn) return;
      extraEl.innerHTML = "";
      const w = canvas.width;
      canvas.width = 0;
      canvas.width = w;
      fn();
      open();
    });
  });
}

// ======= MINI-CARDS: esconder/mostrar via localStorage =======
const HIDDEN_KEY = "wb:hiddenMiniCards";

// Lê/grava o estado (guardamos pares {key,title} para o Settings conseguir mostrar nomes)
function getHiddenCards() {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
  } catch {
    return [];
  }
}
function setHiddenCards(arr) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(arr || []));
}
function isHidden(key) {
  return getHiddenCards().some((x) => x.key === key);
}
function hideCard(key, title) {
  const set = getHiddenCards();
  if (!set.some((x) => x.key === key)) {
    set.push({ key, title });
    setHiddenCards(set);
  }
}
function unhideCard(key) {
  setHiddenCards(getHiddenCards().filter((x) => x.key !== key));
}

// Insere botão ❌ e aplica estado visível/oculto
function setupMiniCardHider(outletEl) {
  const cards = [
    ...(outletEl || document).querySelectorAll(".mini-card[data-chart]"),
  ];
  cards.forEach((card) => {
    const key = card.dataset.chart;
    const title =
      card.querySelector(".mini-card__title")?.textContent?.trim() || key;

    // cria botão ❌ se não existir
    if (!card.querySelector(".mini-card__close")) {
      const btn = document.createElement("button");
      btn.className = "mini-card__close";
      btn.type = "button";
      btn.title = "Ocultar este mini-card";
      btn.setAttribute("aria-label", "Ocultar este mini-card");
      btn.textContent = "×";
      btn.addEventListener("click", (e) => {
        e.stopPropagation(); // não abrir o modal por engano
        // marca como oculto e esconde já
        hideCard(key, title);
        const item = card.closest(".carousel-item") || card;
        item.style.display = "none";
        // dispara evento global para o Settings atualizar a “prateleira”
        window.dispatchEvent(
          new CustomEvent("wb:minicard:changed", {
            detail: { action: "hide", key, title },
          }),
        );
      });
      card.appendChild(btn);
    }

    // estado inicial
    const item = card.closest(".carousel-item") || card;
    item.style.display = isHidden(key) ? "none" : "";
  });
}

// =============================== DASHBOARD INIT ===============================
import { MiniReport } from "../components/MiniReport.js";

export async function init({ sb, outlet } = {}) {
  sb = sb || window.sb;
  if (sb) await loadTheme(sb);
  outlet = outlet || document.getElementById("outlet");

  // Expose for debug
  window.MiniReport = MiniReport;

  // -------- Chart.js on-demand --------
  await ensureChartStack();

  function setupCarousel(box, track, dotsBox) {
    if (!box || !track) return;

    // Identify target carousels
    const isMini =
      box.classList.contains("mini-carousel") || track.id === "mini-track";
    const isUpcoming = box.classList.contains("upcoming-carousel");
    const isMulti = isMini || isUpcoming;

    // Only count items that are NOT hidden
    const allItems = Array.from(track.querySelectorAll(".carousel-item"));
    const items = allItems.filter(
      (i) =>
        i.style.display !== "none" && getComputedStyle(i).display !== "none",
    );
    if (!items.length) return;

    let currentIdx = 0;

    const getItemsPerView = () => {
      const w = window.innerWidth;

      // Quick Analysis (Compact)
      if (isMini) {
        if (w >= 900) return 6;
        if (w >= 600) return 5;
        if (w >= 420) return 4;
        return 3;
      }

      // Upcoming Expenses (Slightly Wider)
      if (isUpcoming) {
        if (w >= 900) return 5; // Wider than mini
        if (w >= 600) return 3; // Tablet: 3 instead of 5
        if (w >= 420) return 2; // Mobile Wide: 2 instead of 4
        return 2; // Mobile Tiny: 2 instead of 3 (or maybe 1.5 if using fractional? sticking to int for now. 2 is good.)
      }

      return 1; // Fallback for others
    };

    const showSlide = (idx) => {
      const perView = getItemsPerView();

      // Update item widths if Multi
      if (isMulti) {
        const basis = 100 / perView;
        items.forEach((el) => {
          el.style.flex = `0 0 ${basis}%`;
          el.style.minWidth = `${basis}%`;
          el.style.maxWidth = `${basis}%`;
        });
      }

      const total = items.length;
      let maxIdx = Math.max(0, total - perView);

      // Cycle logic
      if (idx > maxIdx) idx = 0;
      if (idx < 0) idx = maxIdx;

      currentIdx = idx;

      // Translate: step is 100% / perView * index
      const stepPct = 100 / perView;
      track.style.transform = `translateX(-${currentIdx * stepPct}%)`;

      if (dotsBox) {
        const allDots = dotsBox.querySelectorAll(".carousel-dot");
        allDots.forEach((d, i) =>
          d.classList.toggle("active", i === currentIdx),
        );
      }
    };

    // Navigation Buttons (Insert dynamically if not present)
    let btnPrev = box.querySelector(".carousel-nav--prev");
    let btnNext = box.querySelector(".carousel-nav--next");

    if (!btnPrev) {
      const p = document.createElement("button");
      p.className = "carousel-nav carousel-nav--prev";
      p.innerHTML =
        '<svg viewBox="0 0 24 24"><use href="#i-chevron-left" /></svg>';
      p.ariaLabel = "Anterior";
      box.appendChild(p);
      btnPrev = p;
    }
    if (!btnNext) {
      const n = document.createElement("button");
      n.className = "carousel-nav carousel-nav--next";
      n.innerHTML =
        '<svg viewBox="0 0 24 24"><use href="#i-chevron-right" /></svg>';
      n.ariaLabel = "Próximo";
      box.appendChild(n);
      btnNext = n;
    }

    btnPrev.onclick = (e) => {
      e.stopPropagation();
      showSlide(currentIdx - 1);
    };
    btnNext.onclick = (e) => {
      e.stopPropagation();
      showSlide(currentIdx + 1);
    };

    // Touch Swipe Logic
    let touchStartX = 0;
    let touchEndX = 0;

    box.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.changedTouches[0].screenX;
      },
      { passive: true },
    );

    box.addEventListener(
      "touchend",
      (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
      },
      { passive: true },
    );

    const handleSwipe = () => {
      const swipeThreshold = 50;
      const diff = touchEndX - touchStartX;
      if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0)
          showSlide(currentIdx - 1); // Swipe Right -> Prev
        else showSlide(currentIdx + 1); // Swipe Left -> Next
      }
    };

    if (dotsBox) {
      dotsBox.innerHTML = Array.from(items)
        .map(
          (_, i) =>
            `<div class="carousel-dot ${i === 0 ? "active" : ""}" data-idx="${i}"></div>`,
        )
        .join("");
      dotsBox.querySelectorAll(".carousel-dot").forEach((d) => {
        d.addEventListener("click", () => showSlide(Number(d.dataset.idx)));
      });
    }

    // Auto-scroll (optional, keeping existing behavior)
    if (box._autoInterval) clearInterval(box._autoInterval);
    box._autoInterval = setInterval(() => showSlide(currentIdx + 1), 5000);

    box.onmouseenter = () => clearInterval(box._autoInterval);
    box.onmouseleave = () => {
      clearInterval(box._autoInterval);
      box._autoInterval = setInterval(() => showSlide(currentIdx + 1), 5000);
    };

    window.addEventListener("resize", () => {
      showSlide(currentIdx);
    });

    // Initial
    showSlide(0);

    return { showSlide };
  }

  // -------- helpers --------
  const byId = (id) => outlet.querySelector("#" + id);
  const setText = (id, text) => {
    const el = byId(id);
    if (el) el.textContent = text;
  };
  // Removed local money, pad2, etc. - using imports

  const labelMonthPT = (isoYYYYMM) => {
    const [y, m] = isoYYYYMM.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-PT", {
      month: "short",
      year: "numeric",
    });
  };
  const monthKeyFromRow = (rowMonth) => String(rowMonth).slice(0, 7);
  const lastNMonthsKeys = (n) => {
    const out = [],
      base = new Date();
    base.setDate(1);
    base.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      out.push(ymd(d).slice(0, 7));
    }
    return out;
  };
  const currentMonthRangeISO = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from: ymd(start), to: ymd(end) };
  };

  // --- Privacidade KPIs ---
  const PRIV_KEY = "wb:kpi:hidden";
  let kpiHidden = localStorage.getItem(PRIV_KEY) === "1";
  const maskDigits = (s) => String(s).replace(/\d/g, "*");
  const setKpi = (id, text) => {
    const el = byId(id);
    if (!el) return;
    el.dataset.raw = text;
    el.textContent = kpiHidden ? maskDigits(text) : text;
  };
  const updateKpiEyeBtn = () => {
    const btn = outlet.querySelector("#kpi-privacy-toggle");
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(kpiHidden));
    btn.title = kpiHidden ? "Mostrar valores" : "Ocultar valores";
    btn.setAttribute("aria-label", btn.title);
    const use = btn.querySelector("use");
    if (use) use.setAttribute("href", kpiHidden ? "#i-eye-off" : "#i-eye");
  };
  outlet.querySelector("#kpi-privacy-toggle")?.addEventListener("click", () => {
    kpiHidden = !kpiHidden;
    localStorage.setItem(PRIV_KEY, kpiHidden ? "1" : "0");
    ["kpi-income", "kpi-expense", "kpi-savings", "kpi-balance"].forEach(
      (id) => {
        const el = byId(id);
        const raw = el?.dataset?.raw;
        if (raw) el.textContent = kpiHidden ? maskDigits(raw) : raw;
      },
    );
    updateKpiEyeBtn();
  });
  updateKpiEyeBtn();

  // charts lifecycle
  const charts = [];
  const addChart = (c) => charts.push(c);
  const destroyCharts = () =>
    charts.splice(0).forEach((c) => {
      try {
        c.destroy();
      } catch {}
    });
  const mountChart = (id, cfg) => {
    const el = byId(id);
    if (!el || !el.getContext) return null;
    const existing = window.Chart?.getChart?.(el);
    if (existing) existing.destroy();
    const c = new Chart(el.getContext("2d"), cfg);
    addChart(c);
    return c;
  };
  destroyCharts();

  // ===================== Dados (via SB ou DEMO) =====================
  const HAS_SB = !!(sb && typeof sb.from === "function");
  const monthsKeys = lastNMonthsKeys(12);

  // Alterado: Carregar desde o início do ano ANTERIOR para ter base de comparação (homólogo)
  const from12Local = (() => {
    const now = new Date();
    const prevYear = now.getFullYear() - 1;
    return `${prevYear}-01-01`;
  })();

  let monthly = [];
  let allHistoryMap = new Map(); // Guarda histórico completo
  let fixedVarByMonth = new Map();
  let annualFixedByMonth = new Map(); // [NEW] Guarda despesas anuais por mês
  let thisMonthAgg = { fixed: 0, variable: 0 };
  let topCatThisMonth = new Map();
  let parentDist = { labels: [], values: [] };
  let methodsAgg = { labels: [], values: [] };
  let regularitiesAgg = { labels: [], values: [] };

  if (HAS_SB) {
    // ------- Monthly via view / fallback -------
    const viaView = await (async () => {
      try {
        const { data, error } = await sb
          .from("v_monthly_summary")
          .select("month,income,expense,savings,net")
          .gte("month", from12Local)
          .order("month", { ascending: true });
        if (error || !data) return null;

        // Guardar tudo no mapa histórico
        const map = new Map();
        data.forEach((r) => {
          const k = monthKeyFromRow(r.month);
          const vals = {
            income: Number(r.income || 0),
            expense: Math.abs(Number(r.expense || 0)),
            savings: Math.abs(Number(r.savings || 0)),
            net: +r.net || 0,
          };
          map.set(k, vals);
        });
        allHistoryMap = map;

        // Retorna apenas os 12 meses para os gráficos principais
        return monthsKeys.map((k) => ({
          key: k,
          label: labelMonthPT(k),
          income: map.get(k)?.income || 0,
          expense: map.get(k)?.expense || 0,
          savings: map.get(k)?.savings || 0,
          net: map.get(k)?.net || 0,
        }));
      } catch {
        return null;
      }
    })();
    if (viaView) monthly = viaView;

    if (!monthly.length) {
      try {
        const { data: types } = await sb
          .from("transaction_types")
          .select("id,code");
        const TYPE_BY_ID = new Map((types || []).map((t) => [t.id, t.code]));
        const { data: tx } = await sb
          .from("transactions")
          .select("date,amount,type_id")
          .gte("date", from12Local)
          .order("date", { ascending: true });
        const agg = new Map();
        (tx || []).forEach((r) => {
          const k = String(r.date).slice(0, 7);
          const a = Number(r.amount || 0);
          const code = TYPE_BY_ID.get(r.type_id);
          const m = agg.get(k) || { income: 0, expense: 0, savings: 0, net: 0 };
          if (code === "INCOME") {
            m.income += a;
            m.net += a;
          } else if (code === "EXPENSE") {
            m.expense += a;
            m.net -= a;
          } else if (code === "SAVINGS") {
            m.savings += a;
            m.net -= a;
          }
          agg.set(k, m);
        });

        allHistoryMap = agg; // Guardar histórico completo

        monthly = monthsKeys.map((k) => ({
          key: k,
          label: labelMonthPT(k),
          ...(agg.get(k) || { income: 0, expense: 0, savings: 0, net: 0 }),
        }));
      } catch (e) {}
    }

    // --- Normalizar e forçar o NET ---
    monthly = (monthly || []).map((m) => {
      const income = Number(m.income || 0);
      const expense = Math.abs(Number(m.expense || 0));
      const savings = Math.abs(Number(m.savings || 0));
      const net = income - expense - savings;
      return { ...m, income, expense, savings, net };
    });

    // ------- Fixas/Variáveis + Top categorias + Pais + CASHFLOW FINDER -------
    // Modificado para buscar também INCOME e regularidades, para construir o gráfico de Cashflow Fixo
    let cfFixed = { labels: [], net: [], cum: [] }; // definindo aqui para estar acessível

    try {
      const { data: tTypes } = await sb
        .from("transaction_types")
        .select("id,code");
      const expTypeId = tTypes.find((t) => t.code === "EXPENSE")?.id ?? -999;
      const incTypeId = tTypes.find((t) => t.code === "INCOME")?.id ?? -999;

      let hasTxNature = true,
        hasCatNature = true,
        hasRegularity = true;
      try {
        await sb.from("transactions").select("id, expense_nature").limit(1);
      } catch {
        hasTxNature = false;
      }
      try {
        await sb
          .from("categories")
          .select("id, expense_nature_default")
          .limit(1);
      } catch {
        hasCatNature = false;
      }

      const cols = [
        "date",
        "amount",
        "type_id",
        "category_id",
        "regularity_id",
        "regularities(code,name_pt)",
        hasTxNature ? "expense_nature" : null,
        hasCatNature
          ? "categories(expense_nature_default,name,parent_id)"
          : "categories(name,parent_id)",
      ]
        .filter(Boolean)
        .join(",");

      // Fetch all expense AND income transactions (paginated) for last 12 months
      let data = [];
      {
        let page = 0;
        const size = 1000;
        while (true) {
          const { data: chunk, error } = await sb
            .from("transactions")
            .select(cols)
            .in("type_id", [expTypeId, incTypeId])
            .gte("date", from12Local)
            .range(page * size, (page + 1) * size - 1)
            .order("date", { ascending: true });
          if (error || !chunk || !chunk.length) break;
          data = data.concat(chunk);
          if (chunk.length < size) break;
          page++;
        }
      }

      const parentsMap = new Map();
      try {
        const { data: cats } = await sb
          .from("categories")
          .select("id,name,parent_id")
          .order("id");
        (cats || []).forEach((c) =>
          parentsMap.set(c.id, { name: c.name, parent_id: c.parent_id }),
        );
      } catch {}

      const catPath = (id, rowCat = null) => {
        if (!id && !rowCat) return "(Sem categoria)";
        // Try rowCat first (joined data)
        if (rowCat) {
          if (rowCat.parent_id) {
            const p = parentsMap.get(rowCat.parent_id);
            if (p) return `${p.name} > ${rowCat.name}`;
            return rowCat.name;
          }
          return rowCat.name;
        }
        const c = parentsMap.get(id);
        if (!c) return "(Sem categoria)";
        if (!c.parent_id) return c.name;
        const p = parentsMap.get(c.parent_id);
        return (p?.name ? p.name + " > " : "") + c.name;
      };

      const parentNameOf = (row) => {
        const rc = row.categories;
        if (rc) {
          if (rc.parent_id) {
            const p = parentsMap.get(rc.parent_id);
            return p?.name || rc.name;
          }
          return rc.name;
        }
        return "(Sem categoria)";
      };

      // ==== Lógica de Classificação FIXO ====
      const FIXED_HINTS = [
        "renda",
        "utilidades",
        "tv + internet",
        "internet",
        "seguro",
        "créditos",
        "mensalidades",
        "assinaturas",
        "telemóveis",
        "empregada",
        "iuc",
      ];
      const looksFixedEXP = (name) =>
        FIXED_HINTS.some((h) => (name || "").toLowerCase().includes(h));

      const isFixedExpense = (row) => {
        // 1. Natureza explícita na tx
        const txNat = hasTxNature ? row.expense_nature : null;
        if (txNat && ["fixed", "fixa"].includes(txNat.toLowerCase()))
          return true;
        // 2. Natureza na categoria
        const catDef = hasCatNature
          ? row.categories?.expense_nature_default
          : null;
        if (catDef && ["fixed", "fixa"].includes(catDef.toLowerCase()))
          return true;
        // 3. Regularidade (se existir e for mensal/anual etc)
        const reg = row.regularities?.code || row.regularities?.name_pt || "";
        if (/mensal|anual|semestral|trimestral/i.test(reg)) return true;
        // 4. Heurística pelo nome da categoria
        return looksFixedEXP(catPath(row.category_id, row.categories));
      };

      const isFixedIncome = (row) => {
        // 1. Regularidade
        const reg = row.regularities?.code || row.regularities?.name_pt || "";
        if (/mensal|anual|semestral|trimestral/i.test(reg)) return true;
        // 2. Palavras chave na categoria ou nome
        const catName = (row.categories?.name || "").toLowerCase();
        if (/salário|ordenado|vencimento|pensão|subsidio|renda/i.test(catName))
          return true;
        return false;
      };

      fixedVarByMonth = new Map();
      const fixedCashflowByMonth = new Map(); // map: '2025-01' -> { incFixed, expFixed }
      monthsKeys.forEach((k) =>
        fixedCashflowByMonth.set(k, { incFixed: 0, expFixed: 0 }),
      );

      thisMonthAgg = { fixed: 0, variable: 0 };
      topCatThisMonth = new Map();
      const parentAgg12m = new Map();

      const { from: monthStart, to: monthEnd } = currentMonthRangeISO();

      (data || []).forEach((r) => {
        const k = String(r.date).slice(0, 7);
        const amt = Number(r.amount || 0);
        const isExp = r.type_id === expTypeId;

        // --- FILTRO DE EXCEPÇÃO (User Request) ---
        // Excluir despesa 'Casa > Manutenção' > 2500€ em Dez 2025 (ex: Obras de 35k)
        // para não estragar a projeção de 2026 (Net Total e Sazonalidade).
        if (k === "2025-12" && isExp && amt > 2500) {
          const path = catPath(r.category_id, r.categories).toLowerCase();
          if (path.includes("manutenção") && path.includes("casa")) {
            console.log(`⚠️ Excluding outlier from ${k}: ${amt}€ (${path})`);

            // 1. Corrigir allHistoryMap (que vem da View com dados agregados)
            const hist = allHistoryMap.get(k);
            if (hist) {
              hist.expense = Math.max(0, (hist.expense || 0) - amt);
              hist.net = (hist.net || 0) + amt; // Saldo aumenta se despesa sai
            }
            // 2. Ignorar esta transação para as próximas agregações (FixedVar, etc)
            return;
          }
        }

        const isInc = r.type_id === incTypeId;

        // --- Lógica Chart Cashflow (Fixo) ---
        if (!fixedCashflowByMonth.has(k)) {
          fixedCashflowByMonth.set(k, { incFixed: 0, expFixed: 0 });
        }
        const entry = fixedCashflowByMonth.get(k);

        if (isInc && isFixedIncome(r)) {
          entry.incFixed += amt;
        } else if (isExp && isFixedExpense(r)) {
          entry.expFixed += Math.abs(amt);

          // [NEW] Check if it is an ANNUAL Fixed Expense to separate it
          // Heuristic: Regularity code is 'YEARLY' or 'ANUAL'
          const regCode = (r.regularities?.code || "").toUpperCase();
          const regName = (r.regularities?.name_pt || "").toUpperCase();
          if (
            regCode === "YEARLY" ||
            regCode === "ANNUAL" ||
            regName.includes("ANUAL")
          ) {
            annualFixedByMonth.set(
              k,
              (annualFixedByMonth.get(k) || 0) + Math.abs(amt),
            );
          }
        }

        // --- Lógica Antiga (Para donut e barras fix/var) - Apenas Despesas ---
        if (isExp) {
          const fv = fixedVarByMonth.get(k) || { fixed: 0, variable: 0 };
          const isF = isFixedExpense(r);
          if (isF) fv.fixed += amt;
          else fv.variable += amt;
          fixedVarByMonth.set(k, fv);

          // Fix: Ensure parentAgg12m only aggregates the last 12 months (matches monthsKeys)
          // to avoid including the extra historical data loaded for seasonal projection.
          if (monthsKeys.includes(k)) {
            const pname = parentNameOf(r);
            parentAgg12m.set(pname, (parentAgg12m.get(pname) || 0) + amt);
          }

          if (r.date >= monthStart && r.date < monthEnd) {
            const kcat = catPath(r.category_id, r.categories);
            topCatThisMonth.set(kcat, (topCatThisMonth.get(kcat) || 0) + amt);
            if (isF) thisMonthAgg.fixed += amt;
            else thisMonthAgg.variable += amt;
          }
        }
      });

      // --- Build Cashflow Series ---
      let running = 0;
      monthsKeys.forEach((k) => {
        const { incFixed, expFixed } = fixedCashflowByMonth.get(k);
        const net = incFixed - expFixed;
        running += net;
        cfFixed.labels.push(labelMonthPT(k));
        cfFixed.net.push(net);
        cfFixed.cum.push(running);
      });

      const parentArr = Array.from(parentAgg12m.entries()).sort(
        (a, b) => b[1] - a[1],
      );
      const top = parentArr.slice(0, 9);
      const other = parentArr.slice(9).reduce((s, [, v]) => s + v, 0);
      parentDist.labels = top
        .map(([n]) => n)
        .concat(other > 0 ? ["Outras"] : []);
      parentDist.values = top
        .map(([, v]) => v)
        .concat(other > 0 ? [other] : []);
    } catch (e) {
      console.error("Data fetch error", e);
    }

    // ------- Métodos (120d) -------
    try {
      const d = new Date();
      d.setDate(d.getDate() - 120);
      const { data } = await sb
        .from("transactions")
        .select("amount, payment_methods(name_pt)")
        .gte("date", ymd(d));
      const pmMap = new Map();
      (data || []).forEach((r) => {
        const name = r.payment_methods?.name_pt || "Outro";
        pmMap.set(name, (pmMap.get(name) || 0) + Number(r.amount || 0));
      });
      methodsAgg.labels = Array.from(pmMap.keys());
      methodsAgg.values = methodsAgg.labels.map((k) => pmMap.get(k) || 0);
    } catch {}

    // ------- Regularidades (mês) -------
    try {
      const { data: ttypeExp } = await sb
        .from("transaction_types")
        .select("id,code")
        .eq("code", "EXPENSE")
        .single();
      const expTypeId = ttypeExp?.id ?? -999;
      const { from, to } = currentMonthRangeISO();
      const { data } = await sb
        .from("transactions")
        .select("amount, regularities(name_pt,code)")
        .eq("type_id", expTypeId)
        .gte("date", from)
        .lt("date", to);
      const agg = new Map();
      const keyOf = (r) =>
        r.regularities?.name_pt || r.regularities?.code || "Sem regularidade";
      (data || []).forEach((r) => {
        const k = keyOf(r);
        agg.set(k, (agg.get(k) || 0) + Number(r.amount || 0));
      });
      regularitiesAgg.labels = Array.from(agg.keys());
      regularitiesAgg.values = regularitiesAgg.labels.map(
        (k) => agg.get(k) || 0,
      );
    } catch {}
  }

  // ---------------- DEMO (fallback) ----------------
  if (!monthly.length) {
    const labs = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];
    const income = [500, 600, 550, 580, 620, 590, 610, 640, 600, 650, 670, 700];
    const expense = [
      400, 420, 390, 410, 430, 420, 440, 460, 450, 470, 480, 500,
    ];
    const savings = [
      100, 150, 130, 140, 190, 170, 180, 180, 150, 180, 190, 200,
    ];
    const net = income.map((v, i) => v - expense[i] - savings[i]);
    monthly = labs.map((label, i) => ({
      key: label,
      label,
      income: income[i],
      expense: expense[i],
      savings: savings[i],
      net: net[i],
    }));

    fixedVarByMonth = new Map(
      labs.map((m, i) => [
        m,
        {
          fixed: Math.round(expense[i] * 0.6),
          variable: Math.round(expense[i] * 0.4),
        },
      ]),
    );
    thisMonthAgg = { fixed: 720, variable: 330 };
    topCatThisMonth = new Map([
      ["Casa > Renda", 400],
      ["Alimentação > Super", 250],
      ["Carro > Combustível", 180],
      ["Saúde > Consultas", 120],
      ["Lazer > Restaurantes", 100],
    ]);
    parentDist = {
      labels: ["Casa", "Alimentação", "Carro", "Saúde", "Lazer", "Outras"],
      values: [520, 250, 180, 120, 100, 60],
    };
    methodsAgg = {
      labels: ["Cartão", "MBWay", "Débito", "Transferência"],
      values: [380, 210, 120, 90],
    };
    regularitiesAgg = {
      labels: ["Mensal", "Semanal", "Anual", "Sem regularidade"],
      values: [800, 150, 120, 80],
    };
  }

  //====== Mini-Card: Investimentos ======//
  // ===== Investimentos (portfolios) – helpers locais =====
  async function dashGetUserId() {
    return (await sb.auth.getUser()).data?.user?.id;
  }
  function dashPad2(n) {
    return String(n).padStart(2, "0");
  }
  function dashYmd(d) {
    return `${d.getFullYear()}-${dashPad2(d.getMonth() + 1)}-${dashPad2(d.getDate())}`;
  }
  function dashMonthKeysBetween(fromISO, toISO) {
    const out = [],
      [y1, m1] = fromISO.split("-").map(Number),
      [y2, m2] = toISO.split("-").map(Number);
    for (let y = y1, m = m1; y < y2 || (y === y2 && m <= m2); ) {
      out.push(`${y}-${dashPad2(m)}`);
      m++;
      if (m === 13) {
        m = 1;
        y++;
      }
    }
    return out;
  }
  function dashBuildSeries(
    { aprPct, compounding = "monthly", initial_amount = 0, start_date = null },
    txs,
    fromISO,
    toISO,
  ) {
    const r = Number(aprPct || 0) / 100;
    const months = dashMonthKeysBetween(fromISO.slice(0, 7), toISO.slice(0, 7));
    const byMonth = new Map(
      months.map((k) => [k, { contrib: 0, interest: 0, balance: 0 }]),
    );
    for (const t of txs) {
      const k = String(t.date).slice(0, 7);
      if (!byMonth.has(k))
        byMonth.set(k, { contrib: 0, interest: 0, balance: 0 });
      byMonth.get(k).contrib += Number(t.amount || 0);
    }
    let balance = Number(initial_amount || 0);
    const annivMonth = start_date
      ? Number(String(start_date).slice(5, 7))
      : Number(fromISO.slice(5, 7));
    const out = [];
    for (const k of months) {
      const row = byMonth.get(k) || { contrib: 0, interest: 0, balance: 0 };
      balance += row.contrib;
      let i = 0;
      if (compounding === "monthly") i = balance > 0 ? balance * (r / 12) : 0;
      else {
        const m = Number(k.slice(5, 7));
        if (balance > 0 && m === annivMonth) i = balance * r;
      }
      balance += i;
      row.interest = i;
      row.balance = balance;
      out.push({ key: k, ...row });
    }
    return out;
  }
  async function dashFetchPortfoliosAgg() {
    const uid = await dashGetUserId();
    const { data: pf } = await sb
      .from("portfolios")
      .select("*")
      .eq("user_id", uid);
    if (!pf?.length) return { kinds: [], byKind: new Map(), raw: [] };

    const { data: ttype } = await sb
      .from("transaction_types")
      .select("id,code");
    const SAV = ttype?.find((t) => t.code === "SAVINGS")?.id;

    const today = new Date();
    const toISO = dashYmd(today);

    const out = [];
    for (const p of pf) {
      const fromISO = (p.start_date || p.created_at || "1970-01-01").slice(
        0,
        10,
      );
      const { data: tx } = await sb
        .from("transactions")
        .select("date,amount")
        .eq("type_id", SAV)
        .eq("portfolio_id", p.id)
        .gte("date", fromISO)
        .lte("date", toISO)
        .order("date", { ascending: true });
      const series = dashBuildSeries(
        {
          aprPct: p.apr,
          compounding: p.compounding,
          initial_amount: Number(p.initial_amount || 0),
          start_date: p.start_date,
        },
        tx || [],
        fromISO,
        toISO,
      );
      const aportes = (tx || []).reduce(
        (s, r) => s + (Number(r.amount) || 0),
        0,
      );
      const invested = Number(p.initial_amount || 0) + aportes;
      const current = series.length ? series.at(-1).balance : invested;

      // projeção: +12 meses, sem novos aportes (só juros)
      const projTo = new Date(today);
      projTo.setMonth(projTo.getMonth() + 12);
      const projSeries = dashBuildSeries(
        {
          aprPct: p.apr,
          compounding: p.compounding,
          initial_amount: current,
          start_date: p.start_date,
        },
        [],
        dashYmd(today),
        dashYmd(projTo),
      );
      const projected = projSeries.length ? projSeries.at(-1).balance : current;

      out.push({ ...p, invested, current, projected });
    }

    const byKind = new Map();
    for (const p of out) {
      const k = p.kind || "Outro";
      if (!byKind.has(k))
        byKind.set(k, {
          invested: 0,
          current: 0,
          projected: 0,
          color: p.color || null,
        });
      const b = byKind.get(k);
      b.invested += p.invested;
      b.current += p.current;
      b.projected += p.projected;
      if (!b.color && p.color) b.color = p.color;
    }
    return { kinds: Array.from(byKind.keys()), byKind, raw: out };
  }

  //====== Fim mini-card: Investimentos==//
  // ---------------- DEMO (fallback) ----------------
  if (!monthly.length) {
    // Usar os mesmos monthsKeys que os dados reais
    const income = [500, 600, 550, 580, 620, 590, 610, 640, 600, 650, 670, 700];
    const expense = [
      400, 420, 390, 410, 430, 420, 440, 460, 450, 470, 480, 500,
    ];
    const savings = [
      100, 150, 130, 140, 190, 170, 180, 180, 150, 180, 190, 200,
    ];
    const net = income.map((v, i) => v - expense[i] - savings[i]);
    monthly = monthsKeys.map((key, i) => ({
      key, // Usar YYYY-MM format
      label: labelMonthPT(key), // Gerar label formatado
      income: income[i],
      expense: expense[i],
      savings: savings[i],
      net: net[i],
    }));

    fixedVarByMonth = new Map(
      monthsKeys.map((m, i) => [
        m,
        {
          fixed: Math.round(expense[i] * 0.6),
          variable: Math.round(expense[i] * 0.4),
        },
      ]),
    );
    thisMonthAgg = { fixed: 720, variable: 330 };
    topCatThisMonth = new Map([
      ["Casa > Renda", 400],
      ["Alimentação > Super", 250],
      ["Carro > Combustível", 180],
      ["Saúde > Consultas", 120],
      ["Lazer > Restaurantes", 100],
    ]);
    parentDist = {
      labels: ["Casa", "Alimentação", "Carro", "Saúde", "Lazer", "Outras"],
      values: [520, 250, 180, 120, 100, 60],
    };
    methodsAgg = {
      labels: ["Cartão", "MBWay", "Débito", "Transferência"],
      values: [380, 210, 120, 90],
    };
    regularitiesAgg = {
      labels: ["Mensal", "Semanal", "Anual", "Sem regularidade"],
      values: [800, 150, 120, 80],
    };
  }

  // ===================== Séries diárias (para mini-card "Gasto diário") =====================
  let dailyLabels = [],
    dailyCumReal = [],
    dailyCumForecast = [];
  async function computeDailySeries() {
    const { from, to } = currentMonthRangeISO();
    const today = new Date();
    const y = today.getFullYear(),
      m = today.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const fmt = (d) =>
      new Date(y, m, d).toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "short",
      });
    dailyLabels = Array.from({ length: lastDay }, (_, i) => fmt(i + 1));
    const todayIdx = Math.max(0, Math.min(today.getDate() - 1, lastDay - 1));

    // fallback suave com base no KPI "Despesas" do mês (último monthly)
    const fallbackTotal = Math.abs(
      (monthly[monthly.length - 1] || {}).expense || 0,
    );
    const sigmoid = (d) => 1 / (1 + Math.exp(-0.25 * (d - lastDay / 2)));
    const norm = 1 / (1 + Math.exp(-0.25 * (lastDay - lastDay / 2)));
    const smooth = (d) => fallbackTotal * (sigmoid(d) / norm);
    const tmpVals = dailyLabels.map((_, i) => smooth(i + 1) - smooth(i) || 0);
    const cumDemo = [];
    tmpVals.reduce((acc, v, i) => (cumDemo[i] = acc + v), 0);

    let dailyValues = dailyLabels.map(() => 0);
    if (HAS_SB) {
      try {
        const { data: types2 } = await sb
          .from("transaction_types")
          .select("id,code");
        const CODE_BY_ID = new Map((types2 || []).map((t) => [t.id, t.code]));
        const { data } = await sb
          .from("transactions")
          .select("date,amount,type_id")
          .gte("date", from)
          .lt("date", to)
          .order("date", { ascending: true });

        const dayMap = new Map();
        (data || [])
          .filter((r) => CODE_BY_ID.get(r.type_id) === "EXPENSE")
          .forEach((r) => {
            const d = new Date(r.date);
            const lbl = d.toLocaleDateString("pt-PT", {
              day: "2-digit",
              month: "short",
            });
            dayMap.set(lbl, (dayMap.get(lbl) || 0) + Number(r.amount || 0));
          });
        dailyValues = dailyLabels.map((lbl) => dayMap.get(lbl) || 0);
      } catch {
        dailyValues = tmpVals; // fallback
      }
    } else {
      dailyValues = tmpVals; // fallback
    }

    const cum = [];
    dailyValues.reduce((acc, v, i) => (cum[i] = acc + v), 0);
    const spentSoFar = cum[todayIdx] || 0;
    dailyCumReal = cum.map((v, i) => (i <= todayIdx ? v : null));

    // previsão simples ao ritmo médio do mês, começando HOJE (coincide no ponto de hoje)
    const daysPassed = todayIdx + 1;
    const rate = daysPassed > 0 ? spentSoFar / daysPassed : 0;
    dailyCumForecast = dailyLabels.map((_, i) =>
      i >= todayIdx ? rate * (i + 1) : null,
    );
  }
  await computeDailySeries();

  // ===================== KPIs =====================
  const latest = monthly[monthly.length - 1] || {
    income: 0,
    expense: 0,
    savings: 0,
    net: 0,
  };
  const prev = monthly[monthly.length - 2] || {
    income: 0,
    expense: 0,
    savings: 0,
    net: 0,
  };
  const pct = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : 0);

  // usa a setKpi já definida na secção de Privacidade
  setKpi("kpi-income", money(latest.income));
  setKpi("kpi-expense", money(Math.abs(latest.expense)));
  setKpi("kpi-savings", money(Math.abs(latest.savings)));
  setKpi("kpi-balance", money(latest.net));

  const setPill = (id, val, goodWhenUp = true) => {
    const el = byId(id);
    if (!el) return;
    const s = `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`;
    el.textContent = s;
    const up = goodWhenUp ? "pill--up" : "pill--down";
    const down = goodWhenUp ? "pill--down" : "pill--up";
    el.className = "pill " + (val >= 0 ? up : down);
  };
  setPill("kpi-income-trend", pct(latest.income, prev.income), true);
  setPill(
    "kpi-expense-trend",
    pct(Math.abs(latest.expense), Math.abs(prev.expense)),
    false,
  );
  setPill(
    "kpi-savings-trend",
    pct(Math.abs(latest.savings), Math.abs(prev.savings)),
    true,
  );
  setPill("kpi-net-trend", pct(latest.net, prev.net), true);

  // ===================== CÁLCULO PREVISÃO (Forecast 12m) =====================
  const forecast12m = { labels: [], net: [], cum: [] };
  (function () {})();
  // Usar média dos últimos 6 meses para projetar
  // Ignoramos o mês atual (incompleto) para média?
  // ===================== CÁLCULO CASHFLOW FIXO (HÍBRIDO 2026) =====================
  // Lógica: Meses passados/atual = REAL. Meses futuros = PREVISÃO (Média Histórica)
  // ===================== CÁLCULO CASHFLOW FIXO (HÍBRIDO 2026 - DUAL) =====================
  // Lógica:
  // 1. Net Fixed = Income - Fixed Expense
  // 2. Net Total = Income - Total Expense (Real or 2025 equivalent)
  const cfFixed = { labels: [], net: [], cum: [], netTotal: [], cumTotal: [] };
  (function () {
    const currentYear = "2026";
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let runningTotalFixed = 0;
    let runningTotalTotal = 0;

    for (let i = 1; i <= 12; i++) {
      const key = `${currentYear}-${String(i).padStart(2, "0")}`;
      let netValFixed = 0;
      let netValTotal = 0;

      if (key <= currentMonthKey) {
        // --- PASSADO/PRESENTE (REAL) ---
        const realData = allHistoryMap.get(key);
        const realFV = fixedVarByMonth.get(key);

        const inc = realData ? Number(realData.income) || 0 : 0;
        const net = realData ? Number(realData.net) || 0 : 0;
        const fixed = realFV ? realFV.fixed || 0 : 0;

        netValFixed = inc - fixed; // Líquido 'Potencial' (só fixas)
        netValTotal = net; // Líquido Real (final)
      } else {
        // --- FUTURO (PROJEÇÃO 2025) ---
        const prevKey = `2025-${String(i).padStart(2, "0")}`;
        const histData = allHistoryMap.get(prevKey);
        const histFV = fixedVarByMonth.get(prevKey);

        if (histData) {
          const inc25 = Number(histData.income) || 0;
          const net25 = Number(histData.net) || 0;
          const fixed25 = histFV ? histFV.fixed || 0 : 0;

          netValFixed = inc25 - fixed25; // Projeção Fixo
          netValTotal = net25; // Projeção Total
        } else {
          // Fallback (média? ou zero?) - mantendo 0 para evitar ruído se não houver dados
          netValFixed = 0;
          netValTotal = 0;
        }
      }

      runningTotalFixed += netValFixed;
      runningTotalTotal += netValTotal;

      cfFixed.labels.push(labelMonthPT(key));
      cfFixed.net.push(netValFixed);
      cfFixed.cum.push(runningTotalFixed);
      cfFixed.netTotal.push(netValTotal);
      cfFixed.cumTotal.push(runningTotalTotal);
    }
  })();

  // ===================== Gráficos principais =====================
  // Tendências (12m)
  mountChart("chart-monthly", {
    type: "bar",
    data: {
      labels: monthly.map((m) => m.label),
      datasets: [
        { type: "bar", label: "Receitas", data: monthly.map((m) => m.income) },
        { type: "bar", label: "Despesas", data: monthly.map((m) => m.expense) },
        {
          type: "bar",
          label: "Poupanças",
          data: monthly.map((m) => m.savings),
        },
        {
          type: "line",
          label: "Saldo",
          data: monthly.map((m) => m.net),
          tension: 0.25,
          borderWidth: 2,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "top" } },
      scales: { y: { beginAtZero: true } },
    },
  });

  // Cashflow (acumulado) — net = income - (|expense| + |savings|)
  const netPerMonth = monthly.map(
    (m) =>
      (Number(m.income) || 0) -
      Math.abs(Number(m.expense) || 0) -
      Math.abs(Number(m.savings) || 0),
  );
  const netCum = [];
  const savCum = [];
  netPerMonth.reduce((acc, v, i) => (netCum[i] = acc + v), 0);
  monthly
    .map((m) => Math.abs(Number(m.savings) || 0))
    .reduce((acc, v, i) => (savCum[i] = acc + v), 0);

  mountChart("chart-cashflow", {
    type: "line",
    data: {
      labels: monthly.map((m) => m.label),
      datasets: [
        {
          label: "Saldo líquido (acum.)",
          data: netCum,
          tension: 0.25,
          borderWidth: 2,
          fill: true,
        },
        {
          label: "Poupanças (acum.)",
          data: savCum,
          tension: 0.25,
          borderWidth: 2,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "top" } },
      scales: { y: { beginAtZero: true } },
    },
  });

  // Fixas vs Variáveis (12m)
  (function () {
    const rows = monthly.map((m) => {
      const fv = fixedVarByMonth.get(m.key || m.label) || {
        fixed: 0,
        variable: 0,
      };
      return { label: m.label, fixed: fv.fixed, variable: fv.variable };
    });
    mountChart("chart-fixed-stacked", {
      type: "bar",
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          { label: "Fixas", data: rows.map((r) => r.fixed), stack: "exp" },
          {
            label: "Variáveis",
            data: rows.map((r) => r.variable),
            stack: "exp",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v =
                  (ctx.dataset.indexAxis ||
                    ctx.chart.options.indexAxis ||
                    "x") === "y"
                    ? ctx.parsed.x
                    : ctx.parsed.y;
                return " " + (ctx.dataset.label || "") + ": " + money(v);
              },
            },
          },
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true },
        },
      },
    });
  })();

  // Donut (mês)
  (function () {
    const fixed = thisMonthAgg.fixed || 0;
    const variable = thisMonthAgg.variable || 0;
    mountChart("chart-fixed-donut", {
      type: "doughnut",
      data: {
        labels: ["Fixas", "Variáveis"],
        datasets: [{ data: [fixed, variable] }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: { label: (c) => `${c.label}: ${money(c.parsed)}` },
          },
        },
      },
    });
    setText("kpi-fixed", money(fixed));
    setText("kpi-variable", money(variable));
    const tot = fixed + variable || 1;
    setText("kpi-fixed-share", ((fixed / tot) * 100).toFixed(1) + "%");
    setText("kpi-variable-share", ((variable / tot) * 100).toFixed(1) + "%");
  })();

  // Top categorias (mês)
  (function () {
    const arr = Array.from(topCatThisMonth.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    mountChart("chart-top-categories", {
      type: "bar",
      data: {
        labels: arr.map((x) => x.name),
        datasets: [{ label: "Total", data: arr.map((x) => x.total) }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => money(ctx.parsed.x) } },
        },
        scales: { x: { beginAtZero: true } },
      },
    });
  })();

  // =========== Próximas despesas (Smart Prediction) ===========
  (async function () {
    try {
      let rows = [];
      if (HAS_SB) {
        // Fetch last 18 months to ensure we have history
        const back = new Date();
        back.setMonth(back.getMonth() - 18);
        back.setDate(1);

        // Fetch EXPENSE transactions
        const { data: ttype } = await sb
          .from("transaction_types")
          .select("id,code")
          .eq("code", "EXPENSE")
          .single();
        const expId = ttype?.id || -999;

        // Order by date DESC so we get recent first
        const { data } = await sb
          .from("transactions")
          .select(
            "date, amount, category_id, categories(name,parent_id), regularities(name_pt,code)",
          )
          .eq("type_id", expId)
          .gte("date", ymd(back))
          .order("date", { ascending: false });
        rows = data || [];
      }

      // Pre-fetch Category Names map
      const catParents = new Map();
      if (HAS_SB) {
        const { data: cats } = await sb
          .from("categories")
          .select("id,name,parent_id");
        (cats || []).forEach((c) => catParents.set(c.id, c));
      }
      const catPathName = (row) => {
        const child = row.categories?.name;
        const pid = row.categories?.parent_id;
        const p = pid ? catParents.get(pid) : null;
        return p?.name ? `${p.name} > ${child}` : child || "(Sem categoria)";
      };

      const periodMonths = (reg) => {
        const s = (reg?.code || reg?.name_pt || "").toString().toLowerCase();
        if (/anual|annual/.test(s)) return 12;
        if (/semestr/.test(s)) return 6;
        if (/trimestr|quarter/.test(s)) return 3;
        if (/bimestr|bi-?mensal/.test(s)) return 2;
        if (/mensal|month/.test(s)) return 1;
        return 0;
      };

      // Group by Category+Regularity
      // We want to collect HISTORY (last 3 occurrences)
      const historyMap = new Map(); // key -> [dates...]

      rows.forEach((r) => {
        const per = periodMonths(r.regularities);
        if (!per) return; // ignore non-recurring
        const key = `${r.category_id}|${per}`;

        if (!historyMap.has(key)) {
          historyMap.set(key, {
            dates: [],
            lastAmount: Number(r.amount),
            name: catPathName(r),
            months: per,
          });
        }
        // Add date if not mostly duplicate (avoid same-day double payments distorting logic slightly, but ok for now)
        historyMap.get(key).dates.push(new Date(r.date));
      });

      // Analyze each recurring expense
      const today = new Date();
      // "Start" of window: Today - 15 days (allow checking overdue)
      const windowStart = new Date(today);
      windowStart.setDate(windowStart.getDate() - 15);

      // "End" of window: Today + 35 days (look ahead a bit more)
      const windowEnd = new Date(today);
      windowEnd.setDate(windowEnd.getDate() + 35);

      const upcoming = [];

      for (const [key, info] of historyMap.entries()) {
        const history = info.dates; // sorted DESC
        if (!history.length) continue;

        // 1. Calculate Average Day of Month (from last up to 3 payments)
        const recent = history.slice(0, 3);
        const daySum = recent.reduce((sum, d) => sum + d.getDate(), 0);
        const avgDay = Math.round(daySum / recent.length);

        // 2. Project Next Date
        // Start from the very last known payment
        let cursor = new Date(history[0]); // Last payment date

        // Loop adding 'period' until we are within range or future
        // Safety break: 24 loops (2 years)
        for (let i = 0; i < 24; i++) {
          // Add period
          cursor.setMonth(cursor.getMonth() + info.months);

          // Adjust to Average Day (smart fix)
          // But handle shorter months (e.g. Feb)
          const maxDays = new Date(
            cursor.getFullYear(),
            cursor.getMonth() + 1,
            0,
          ).getDate();
          const targetDay = Math.min(avgDay, maxDays);
          cursor.setDate(targetDay);

          // Validation:
          // If this projected date is BEFORE windowStart, it's too old (already paid or missed long ago).
          // But wait, if user MISSED it, we might want to show it?
          // If manual entry hasn't happened, 'history[0]' is old.
          // So 'cursor' will jump forward until it is >= windowStart.

          if (cursor >= windowStart) {
            // Determine if this is the one to show
            // If it's <= windowEnd, show it!
            if (cursor <= windowEnd) {
              const daysLeft = Math.ceil((cursor - today) / 86400000);
              if (daysLeft >= 0) {
                upcoming.push({
                  name: info.name,
                  amount: info.lastAmount,
                  next: new Date(cursor),
                  daysLeft,
                  avgDay,
                });
              }
            }
            break; // Found the next immediate relevant payment
          }
        }
      }

      upcoming.sort((a, b) => a.next - b.next);

      // Render
      // Render
      const box = outlet.querySelector("#upcoming-fixed-list");
      if (box && upcoming.length) {
        box.innerHTML = `
          <div class="carousel-container upcoming-carousel" id="upcoming-car-box">
            <div class="carousel-track" id="upcoming-track">
              ${upcoming
                .map((u) => {
                  const displayName =
                    String(u.name || "")
                      .split(">")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .at(-1) || "";

                  let badgeClass = "badge-ok";
                  let statusText = `${u.daysLeft} dias`;
                  if (u.daysLeft === 0) {
                    badgeClass = "badge-danger";
                    statusText = "Hoje";
                  } else if (u.daysLeft <= 5) {
                    badgeClass = "badge-danger";
                  } else if (u.daysLeft <= 10) {
                    badgeClass = "badge-warn";
                  }
                  return `
                  <div class="carousel-item">
                    <div class="upcoming-card">
                      <div class="uc-header">
                        <div class="uc-date">
                          <span class="uc-day">${u.next.getDate()}</span>
                          <span class="uc-month">${u.next.toLocaleDateString(
                            "pt-PT",
                            { month: "short" },
                          )}</span>
                        </div>
                        <div class="uc-info">
                          <div class="uc-cat" title="${u.name}">${displayName}</div>
                          <div class="uc-amount">${money(u.amount)}</div>
                        </div>
                      </div>
                      <div class="uc-footer">
                        <span class="badge ${badgeClass}">${statusText}</span>
                        ${
                          u.avgDay !== u.next.getDate()
                            ? '<span title="Ajustado pela média" class="uc-smart"><svg width="14" height="14" style="vertical-align: middle; margin-right: 2px;"><use href="#i-crystal"/></svg> Smart</span>'
                            : ""
                        }
                      </div>
                    </div>
                  </div>`;
                })
                .join("")}
            </div>
            <div class="carousel-dots" id="upcoming-dots"></div>
          </div>
        `;
        setupCarousel(
          box.querySelector("#upcoming-car-box"),
          box.querySelector("#upcoming-track"),
          box.querySelector("#upcoming-dots"),
        );
      } else if (box) {
        box.innerHTML = `<div class="muted" style="padding:16px;text-align:center">Sem despesas fixas previstas.</div>`;
      }
    } catch (e) {
      console.error("Smart prediction error", e);
    }
  })();

  // Métodos (120d)
  mountChart("chart-methods", {
    type: "bar",
    data: {
      labels: methodsAgg.labels,
      datasets: [{ label: "Total", data: methodsAgg.values }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed?.x ?? 0;
              return " " + money(v);
            },
          },
        },
      },
      scales: { x: { beginAtZero: true } },
    },
  });

  // Regularidades (mês)
  (function () {
    const labels = regularitiesAgg.labels.length
      ? regularitiesAgg.labels
      : ["Mensal", "Semanal", "Anual", "Sem regularidade"];
    const values = regularitiesAgg.values.length
      ? regularitiesAgg.values
      : [800, 150, 120, 80];
    const total = values.reduce((a, b) => a + b, 0) || 1;

    mountChart("chart-regularities", {
      type: "bar",
      data: { labels, datasets: [{ label: "Total (€)", data: values }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed?.y ?? 0;
                const p = ((v / total) * 100).toFixed(1) + "%";
                return ` ${ctx.dataset.label}: ${money(v)} (${p})`;
              },
            },
          },
        },
        scales: { y: { beginAtZero: true } },
      },
    });

    const legendEl = outlet.querySelector("#regularities-legend");
    if (legendEl) {
      legendEl.innerHTML = labels
        .map((lab, i) => {
          const v = values[i] || 0;
          const p = ((v / total) * 100).toFixed(1);
          return `<div class="rpt-legend__item"><span style="flex:1">${lab}</span><strong>${money(
            v,
          )}</strong><span style="color:#64748b">&nbsp;(${p}%)</span></div>`;
        })
        .join("");
    }
  })();

  // Distribuição (pais, 12m) + lista detalhada (12m: €/ano, €/mês, €/registo)
  (async function renderCategoryArea() {
    // === PIZZA (pais, 12m) ===
    const el = byId("chart-cat-pie");
    const ctx = el?.getContext("2d");
    if (ctx) {
      const COLORS = [
        "#ef4444",
        "#22c55e",
        "#3b82f6",
        "#0f766e",
        "#f59e0b",
        "#8b5cf6",
        "#10b981",
        "#f43f5e",
        "#64748b",
        "#e11d48",
      ];
      const bg = (parentDist.labels || []).map(
        (_, i) => COLORS[i % COLORS.length],
      );
      const totalParents =
        (parentDist.values || []).reduce((a, b) => a + b, 0) || 1;

      const PieLabels = {
        id: "pieLabels",
        afterDatasetDraw(chart) {
          const { ctx } = chart,
            meta = chart.getDatasetMeta(0),
            ds = chart.data.datasets[0].data;
          ctx.save();
          meta.data.forEach((arc, i) => {
            const val = Number(ds[i] || 0);
            if (!val) return;
            const pct = parentDistValuesTotal
              ? (val / parentDistValuesTotal) * 100
              : 0;
            if (pct < 4) return;
            const label = chart.data.labels[i];
            const angle = (arc.startAngle + arc.endAngle) / 2;
            const r =
              arc.innerRadius + (arc.outerRadius - arc.innerRadius) * 0.72;
            const x = arc.x + Math.cos(angle) * r,
              y = arc.y + Math.sin(angle) * r;
            ctx.font =
              "12px system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#111827";
            const text =
              label && label.length > 18 ? `${pct.toFixed(1)}%` : `${label}`;
            ctx.fillText(text, x, y);
            if (text !== `${pct.toFixed(1)}%`) {
              ctx.fillStyle = "#6b7280";
              ctx.fillText(`${pct.toFixed(1)}%`, x, y + 12);
            }
          });
          ctx.restore();
        },
      };

      const parentDistValuesTotal = (parentDist.values || []).reduce(
        (a, b) => a + b,
        0,
      );
      const pal = palette(parentDist.labels.length);

      const pie = new Chart(ctx, {
        type: "pie",
        data: {
          labels: parentDist.labels || [],
          datasets: [{ data: parentDist.values || [], backgroundColor: pal }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "right",
              labels: { usePointStyle: true, boxWidth: 8 },
            },
            tooltip: {
              callbacks: {
                label: (tt) => {
                  const v = tt.parsed || 0;
                  const p =
                    parentDistValuesTotal > 0
                      ? ((v / parentDistValuesTotal) * 100).toFixed(1)
                      : 0;
                  return `${tt.label}: ${money(v)} (${p}%)`;
                },
              },
            },
          },
        },
        plugins: [PieLabels],
      });
      addChart(pie);
    }
  })();

  // === LISTA DETALHADA (pai > filho, 12m) ===
  (async function () {
    const box = document.getElementById("cat-list");
    if (!box) return;

    let catAgg12m = window.catAgg12m instanceof Map ? window.catAgg12m : null;
    let catCount12m =
      window.catCount12m instanceof Map ? window.catCount12m : null;

    if (
      (!catAgg12m || !catCount12m) &&
      window.sb &&
      typeof window.sb.from === "function"
    ) {
      try {
        const { data: ttype } = await sb
          .from("transaction_types")
          .select("id,code")
          .eq("code", "EXPENSE")
          .single();
        const expId = ttype?.id ?? -999;

        // Fetch all expenses 12m (paginado)
        let rows = [];
        let page = 0;
        const size = 1000;
        while (true) {
          const { data, error } = await sb
            .from("transactions")
            .select("amount, category_id, categories(name,parent_id)")
            .eq("type_id", expId)
            .gte("date", from12Local)
            .range(page * size, (page + 1) * size - 1)
            .order("date", { ascending: true });

          if (error || !data || !data.length) break;
          rows = rows.concat(data);
          if (data.length < size) break;
          page++;
        }

        const parentsMap = new Map();
        try {
          const { data: cats } = await sb
            .from("categories")
            .select("id,name,parent_id");
          (cats || []).forEach((c) => parentsMap.set(c.id, c));
        } catch {}

        const pathFromRow = (row) => {
          const child = row.categories?.name;
          const pid = row.categories?.parent_id;
          const p = pid ? parentsMap.get(pid) : null;
          return p?.name ? `${p.name} > ${child}` : child || "(Sem categoria)";
        };

        const agg = new Map();
        const cnt = new Map();

        (rows || []).forEach((r) => {
          const amt = Math.abs(Number(r.amount || 0));
          if (!amt) return;
          const name = pathFromRow(r);
          agg.set(name, (agg.get(name) || 0) + amt);
          cnt.set(name, (cnt.get(name) || 0) + 1);
        });

        catAgg12m = agg;
        catCount12m = cnt;
        window.catAgg12m = agg;
        window.catCount12m = cnt;
      } catch (e) {
        console.warn("catAgg12m/catCount12m (SB) falhou:", e);
      }
    }

    if (!catAgg12m || !catCount12m) {
      const demoAgg = new Map(
        Array.from((topCatThisMonth || new Map()).entries()).map(([k, v]) => [
          k,
          (v || 0) * 12,
        ]),
      );
      const demoCnt = new Map(Array.from(demoAgg.keys()).map((k) => [k, 1]));
      catAgg12m = demoAgg;
      catCount12m = demoCnt;
    }

    const arr = Array.from(catAgg12m.entries()).sort((a, b) => b[1] - a[1]);
    // const totalAnual = arr.reduce((s, [, v]) => s + (v || 0), 0) || 1; // Removed duplicate
    const monthsCount = 12;

    // === AGRUPAR POR PAI (Accordion) ===
    const grouped = new Map(); // ParentName -> { total, children: [{name, total, avg, pct}] }

    // Iterar sobre catAgg12m (que já tem totais por "Pai > Filho" ou "Pai")
    // O nome da categoria vem como "Pai > Filho" ou "Pai"
    for (const [fullName, val] of catAgg12m.entries()) {
      const parts = fullName.split(" > ");
      const parentName = parts[0];
      // Se for apenas "Pai" (sem filho), ou se o filho tiver o mesmo nome do pai, chamamos de "(Sem subcategoria)"
      // para explicitar que são movimentos diretos na categoria pai.
      let childName = parts.length > 1 ? parts[1] : "(Sem subcategoria)";
      if (childName === parentName) childName = "(Sem subcategoria)";

      if (!grouped.has(parentName)) {
        grouped.set(parentName, { total: 0, children: [] });
      }
      const g = grouped.get(parentName);
      g.total += Number(val || 0);

      // Se tiver filhos explícitos (parts > 1) ou se quisermos mostrar sempre o item como child
      // Vamos adicionar à lista de children
      const count = Math.max(1, Number(catCount12m.get(fullName) || 0));
      g.children.push({
        name: childName,
        fullName: fullName,
        total: val,
        avg: val / 12, // assumindo 12m fixo
        count,
      });
    }

    // Converter para array e ordenar por total do PAI
    const sortedParents = Array.from(grouped.entries())
      .map(([pName, data]) => ({ name: pName, ...data }))
      .sort((a, b) => b.total - a.total);

    const totalAnual = sortedParents.reduce((acc, p) => acc + p.total, 0) || 1;
    const pal = palette(sortedParents.length);

    box.innerHTML = sortedParents
      .map((p, i) => {
        const pTotal = p.total;
        const pPct = (pTotal / totalAnual) * 100;
        const pAvg = pTotal / 12;
        const color = pal[i % pal.length];

        // Ordenar filhos por valor
        const sortedChildren = p.children.sort((a, b) => b.total - a.total);

        // Renderizar Filhos
        const childrenHtml = sortedChildren
          .map((c) => {
            const cPct = (c.total / pTotal) * 100;
            return `
           <div class="cat-child-item">
             <div style="font-weight:500;">${c.name}</div>
             <div style="text-align:right">
               <div>${money(c.total)} <span class="muted" style="font-size:0.85em">(${cPct.toFixed(0)}%)</span></div>
             </div>
           </div>
         `;
          })
          .join("");

        return `
        <!-- PAI -->
        <div class="cat-group-wrapper">
          <div class="cat-item cat-group-parent" onclick="this.nextElementSibling.hidden = !this.nextElementSibling.hidden; this.querySelector('.cat-chevron').classList.toggle('is-open')">
            <div class="cat-left">
              <span class="cat-dot" style="background:${color}"></span>
              <div style="flex:1">
                <div class="cat-name" style="display:flex; align-items:center; gap:6px;">
                  ${p.name}
                  <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                </div>
                <div class="cat-meta">${pPct.toFixed(1)}% do total</div>
              </div>
            </div>
            <div class="cat-right" style="text-align:right">
              <div class="cat-amount">${money(pTotal)}<span class="muted">/ano</span></div>
              <div class="cat-avg">${money(pAvg)}<span class="muted">/mês</span></div>
            </div>
          </div>
          <!-- FILHOS -->
          <div class="cat-group-children" hidden>
            ${childrenHtml}
          </div>
        </div>
      `;
      })
      .join("");
  })();

  // Distribuição (pais, 12m) - Areachart empilhada
  (async function () {
    const ctx = byId("chart-cat-area");
    if (!ctx) return;
    try {
      let series = [];
      // Top 5 + outros (baseado no parentDist)
      const top5 = parentDist.labels.slice(0, 5);

      if (HAS_SB) {
        const { data: ttype } = await sb
          .from("transaction_types")
          .select("id")
          .eq("code", "EXPENSE")
          .single();
        const expId = ttype?.id;
        const from = from12Local;

        // Fetch all expenses 12m (paginado)
        let allTx = [];
        let page = 0;
        const size = 1000;
        while (true) {
          const { data, error } = await sb
            .from("transactions")
            .select("date, amount, category_id, categories(name,parent_id)")
            .eq("type_id", expId)
            .gte("date", from)
            .range(page * size, (page + 1) * size - 1);
          if (error || !data || !data.length) break;
          allTx = allTx.concat(data);
          if (data.length < size) break;
          page++;
        }

        const parentsMap = new Map();
        try {
          const { data: cats } = await sb.from("categories").select("id,name");
          (cats || []).forEach((c) => parentsMap.set(c.id, c.name));
        } catch {}

        const getParent = (r) => {
          if (r.categories?.parent_id)
            return (
              parentsMap.get(r.categories.parent_id) ||
              r.categories.name ||
              "Outros"
            );
          return r.categories?.name || "Outros";
        };

        const dataMap = new Map(); // Key: month -> Map(parent -> val)
        monthsKeys.forEach((m) => dataMap.set(m, new Map()));

        allTx.forEach((r) => {
          const m = String(r.date).slice(0, 7);
          if (!dataMap.has(m)) return;
          const p = getParent(r);
          const realP = top5.includes(p) ? p : "Outros";
          const d = dataMap.get(m);
          d.set(realP, (d.get(realP) || 0) + Number(r.amount));
        });

        series = [...top5, "Outros"].map((p) => {
          return {
            label: p,
            data: monthsKeys.map((m) => dataMap.get(m)?.get(p) || 0),
            fill: true,
          };
        });
      } else {
        // demo (mock)
        series = [
          {
            label: "Casa",
            data: monthsKeys.map(() => 400 + Math.random() * 50),
            fill: true,
          },
          {
            label: "Supermercado",
            data: monthsKeys.map(() => 200 + Math.random() * 50),
            fill: true,
          },
          {
            label: "Transporte",
            data: monthsKeys.map(() => 100 + Math.random() * 30),
            fill: true,
          },
        ];
      }

      // Estilo
      const pal = palette(series.length);
      series.forEach((s, i) => {
        const c = pal[i];
        // tenta converter hsl -> hsla manually ou usa opacidade se for hex
        s.backgroundColor = c;
        s.borderColor = c;
        s.borderWidth = 1;
      });

      mountChart("chart-cat-area", {
        type: "line",
        data: {
          labels: monthly.map((m) => m.label),
          datasets: series,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y)}`,
              },
            },
          },
          scales: {
            y: { stacked: true, beginAtZero: true },
            x: { stacked: false },
          },
        },
      });
    } catch {}
  })();

  // Footer info
  const fVer = outlet.querySelector("#footer-version");
  if (fVer) fVer.textContent = window.APP_VERSION || "vDev";
  const fHash = outlet.querySelector("#footer-hash");
  if (fHash) fHash.textContent = "";

  // ====== Colapsáveis com SVG inline (após título) ======
  // ====== Colapsáveis com SVG inline (após título) ======
  function enhanceCollapsibles(root) {
    const LS_KEY = "wb:dash:collapsed";
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");

    root
      .querySelectorAll("section.card[data-collapsible]")
      .forEach((card, idx) => {
        const titleEl = card.querySelector(
          ":scope > .section-title, :scope > h2.section-title",
        );
        if (!titleEl) return;

        const key =
          card.dataset.key || titleEl.textContent.trim() || `card-${idx}`;

        if (!card.querySelector(":scope > .card__content")) {
          const wrap = document.createElement("div");
          wrap.className = "card__content";
          const toMove = [];
          let afterTitle = false;
          Array.from(card.childNodes).forEach((n) => {
            if (n === titleEl) {
              afterTitle = true;
              return;
            }
            if (afterTitle) toMove.push(n);
          });
          toMove.forEach((n) => wrap.appendChild(n));
          card.appendChild(wrap);
        }

        let btn = card.querySelector(":scope > .card__toggle");
        if (!btn) {
          btn = document.createElement("button");
          btn.type = "button";
          btn.className = "card__toggle";
          btn.setAttribute("aria-expanded", "true");
          btn.setAttribute("aria-label", "Fechar secção");
          const iconUp = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
          const iconDown = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M18 9l-6 6-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
          btn.dataset.iconUp = iconUp;
          btn.dataset.iconDown = iconDown;
          btn.innerHTML = iconUp;
          titleEl.insertAdjacentElement("afterend", btn);
        }

        const collapsed = !!saved[key];
        card.classList.toggle("is-collapsed", collapsed);
        btn.setAttribute("aria-expanded", String(!collapsed));
        btn.setAttribute(
          "aria-label",
          collapsed ? "Abrir secção" : "Fechar secção",
        );
        btn.innerHTML = collapsed ? btn.dataset.iconDown : btn.dataset.iconUp;

        btn.onclick = () => {
          card.classList.toggle("is-collapsed");
          const isCollapsed = card.classList.contains("is-collapsed");
          btn.setAttribute("aria-expanded", String(!isCollapsed));
          btn.setAttribute(
            "aria-label",
            isCollapsed ? "Abrir secção" : "Fechar secção",
          );
          btn.innerHTML = isCollapsed
            ? btn.dataset.iconDown
            : btn.dataset.iconUp;
          saved[key] = isCollapsed ? 1 : 0;
          localStorage.setItem(LS_KEY, JSON.stringify(saved));
          if (!isCollapsed)
            setTimeout(() => window.dispatchEvent(new Event("resize")), 120);
        };
      });
  }
  enhanceCollapsibles(outlet);

  // ====== Mini-cards + modal ======
  try {
    if (document.querySelector(".dash-mini")) {
      const fixed12m = monthly.map(
        (m) => fixedVarByMonth.get(m.key || m.label)?.fixed || 0,
      );
      const variable12m = monthly.map(
        (m) => fixedVarByMonth.get(m.key || m.label)?.variable || 0,
      );

      const dsMini = {
        labels12m: monthly.map((m) => m.label),
        income12m: monthly.map((m) => m.income),
        expense12m: monthly.map((m) => m.expense),
        savings12m: monthly.map((m) => m.savings),
        saldo12m: monthly.map((m) => m.net),

        fixed12m: monthly.map(
          (m) => fixedVarByMonth.get(m.key || m.label)?.fixed || 0,
        ),
        variable12m: monthly.map(
          (m) => fixedVarByMonth.get(m.key || m.label)?.variable || 0,
        ),

        catLabelsMes: Array.from(topCatThisMonth.keys()),
        catValuesMes: Array.from(topCatThisMonth.values()),

        fixasMes: thisMonthAgg.fixed || 0,
        variaveisMes: thisMonthAgg.variable || 0,

        methodsLabels: methodsAgg.labels,
        methodsValues: methodsAgg.values,

        regLabelsMes: regularitiesAgg.labels.length
          ? regularitiesAgg.labels
          : ["Mensal", "Semanal", "Anual", "Sem regularidade"],
        regTotalsMes: regularitiesAgg.values.length
          ? regularitiesAgg.values
          : [800, 150, 120, 80],

        parentLabels: parentDist.labels,
        parentValues: parentDist.values,

        // fallback seguro para o mini-card
        dailyLabels:
          Array.isArray(dailyLabels) && dailyLabels.length ? dailyLabels : [],
        dailyCumReal:
          Array.isArray(dailyCumReal) && dailyCumReal.length
            ? dailyCumReal
            : [],
        dailyCumForecast:
          Array.isArray(dailyCumForecast) && dailyCumForecast.length
            ? dailyCumForecast
            : [],

        // Cashflow Fixo Histórico
        cfLabels: cfFixed && cfFixed.labels ? cfFixed.labels : [],
        cfNet: cfFixed && cfFixed.net ? cfFixed.net : [],
        cfCum: cfFixed && cfFixed.cum ? cfFixed.cum : [],
        cfNetTotal: cfFixed && cfFixed.netTotal ? cfFixed.netTotal : [],
        cfCumTotal: cfFixed && cfFixed.cumTotal ? cfFixed.cumTotal : [],
      };

      // Debug: verificar se os dados estão sendo calculados
      console.log("📊 Dashboard Data para Modal:", {
        cfLabels: dsMini.cfLabels,
        cfNet: dsMini.cfNet,
        cfCum: dsMini.cfCum,
        monthlyCount: dsMini.labels12m?.length,
      });

      setupDashboardModal(dsMini, {
        allHistoryMap,
        fixedVarByMonth,
        annualFixedByMonth,
      });
    }
  } catch (e) {
    console.warn("mini-cards wiring falhou:", e);
  }

  // ===================== Cleanup Logic =====================
  const cleanup = () => {
    // 1. Remove listeners
    window.removeEventListener("hashchange", onHashChange);

    // 2. Destroy charts
    destroyCharts();
  };

  function onHashChange() {
    if (!location.hash.startsWith("#/")) destroyCharts();
  }
  window.addEventListener("hashchange", onHashChange);

  setupMiniCardHider(outlet);

  // ====== Mini-cards Carousel ======
  const miniTrack = outlet.querySelector("#mini-track");
  if (miniTrack) {
    const miniBox = miniTrack.closest(".carousel-container");
    const miniDots = outlet.querySelector("#mini-dots");
    setupCarousel(miniBox, miniTrack, miniDots);
  }

  // Trigger Mini Report
  setTimeout(() => MiniReport.checkAndShow(), 1500);

  return cleanup;
}
