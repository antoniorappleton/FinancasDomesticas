// src/screens/dashboard.js
// -----------------------------------------------------------------------------
// Dashboard resiliente (com/sem Supabase) + mini-cards (modal)
// - Chart.js on-demand
// - Tooltips monetários robustos (vertical/horizontal/line/pie)
// - Botão colapsar com SVG inline
// - Mini-card "Gasto diário" azul (acumulado) e rosa (previsão)
// -----------------------------------------------------------------------------

// ===================== Mini-cards + Modal (Chart.js) =====================
function setupDashboardModal(ds) {
  const modal = document.getElementById("dash-modal");
  const titleEl = document.getElementById("dash-modal-title");
  const canvas = document.getElementById("dash-modal-canvas");
  const extraEl = document.getElementById("dash-modal-extra");
  const btnX = modal?.querySelector(".modal__close");
  const btnClose = document.getElementById("dash-modal-close");
  let chart;

  const open = () => {
    modal.hidden = false;
  };
  const close = () => {
    modal.hidden = true;
    extraEl.innerHTML = "";
    if (chart) {
      chart.destroy();
      chart = null;
    }
  };
  btnX?.addEventListener("click", close);
  btnClose?.addEventListener("click", close);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  const EUR = (v) =>
    "€ " +
    Number(v || 0).toLocaleString("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const axisMoney = { ticks: { callback: (v) => EUR(v) } };
  const parsedValue = (ctx) => {
    const ds = ctx.chart?.data?.datasets?.[ctx.datasetIndex] || {};
    const ix = ds.indexAxis || ctx.chart?.options?.indexAxis || "x";
    if (ctx.parsed && typeof ctx.parsed === "object") {
      return ix === "y" ? ctx.parsed.x : ctx.parsed.y;
    }
    return ctx.parsed ?? 0;
  };
  const toolMoney = {
    callbacks: {
      label: (ctx) => {
        const lbl = ctx.dataset?.label ? `${ctx.dataset.label}: ` : "";
        return lbl + EUR(parsedValue(ctx));
      },
    },
  };

  const mount = (cfg) => {
    if (chart) chart.destroy();
    chart = new Chart(canvas.getContext("2d"), cfg);
  };

  // ---------- Renderers ----------
  function renderCashflow() {
    titleEl.textContent = "Cashflow anual (12 meses)";
    const labels = ds.labels12m || [];
    const netCum = [],
      savCum = [];
    (ds.saldo12m || []).reduce((acc, v, i) => (netCum[i] = acc + v), 0);
    (ds.savings12m || []).reduce(
      (acc, v, i) => (savCum[i] = acc + Math.abs(v)),
      0
    );

    mount({
      type: "line",
      data: {
        labels,
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
        plugins: { legend: { position: "bottom" }, tooltip: toolMoney },
        scales: { y: { ...axisMoney, beginAtZero: true } },
      },
    });
  }

  function renderTendencias() {
    titleEl.textContent = "Tendências (12 meses)";
    mount({
      data: {
        labels: ds.labels12m || [],
        datasets: [
          { type: "bar", label: "Receitas", data: ds.income12m || [] },
          {
            type: "bar",
            label: "Despesas",
            data: (ds.expense12m || []).map(Math.abs),
          },
          {
            type: "bar",
            label: "Poupanças",
            data: (ds.savings12m || []).map(Math.abs),
          },
          {
            type: "line",
            label: "Saldo",
            data: ds.saldo12m || [],
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
        plugins: { legend: { position: "bottom" }, tooltip: toolMoney },
        scales: {
          x: { stacked: false },
          y: { ...axisMoney, beginAtZero: true },
        },
      },
    });
  }

  function renderFixVarMes() {
    titleEl.textContent = "Fixas vs Variáveis (mês atual)";
    const total = (ds.fixasMes || 0) + (ds.variaveisMes || 0) || 1;
    mount({
      type: "doughnut",
      data: {
        labels: ["Fixas", "Variáveis"],
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
                `${c.label}: ${EUR(c.parsed)} (${(
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
    extraEl.innerHTML = `<div class="rpt-legend__item"><span style="flex:1">Fixas</span><strong>${EUR(
      fix
    )}</strong>
        <span class="muted">&nbsp;(${((fix / (fix + vari || 1)) * 100).toFixed(
          1
        )}%)</span></div>
       <div class="rpt-legend__item"><span style="flex:1">Variáveis</span><strong>${EUR(
         vari
       )}</strong>
        <span class="muted">&nbsp;(${((vari / (fix + vari || 1)) * 100).toFixed(
          1
        )}%)</span></div>`;
  }

  function renderFixVar12m() {
    titleEl.textContent = "Fixas vs Variáveis (12 meses)";
    const labels = ds.labels12m || [];
    const fixed = ds.fixed12m || [];
    const variable = ds.variable12m || [];
    const hasRealFV =
      fixed.length === labels.length &&
      variable.length === labels.length &&
      labels.length > 0;

    const datasets = hasRealFV
      ? [
          { label: "Fixas", data: fixed, stack: "fv" },
          { label: "Variáveis", data: variable, stack: "fv" },
        ]
      : [
          {
            label: "Despesas (aprox.)",
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
    titleEl.textContent = "Distribuição de Despesas";
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
                `${tt.label}: ${EUR(tt.parsed)} (${(
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
    titleEl.textContent = "Top categorias (mês atual)";
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
    titleEl.textContent = "Despesas por Regularidade (mês atual)";
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
        return `<div class="rpt-legend__item"><span style="flex:1">${lab}</span><strong>${EUR(
          v
        )}</strong><span class="muted">&nbsp;(${p}%)</span></div>`;
      })
      .join("");
    document.getElementById("dash-modal-extra").innerHTML = html;
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


  // ==== INVESTIMENTOS (mini-card) ====
async function _dashFetchPortfoliosAgg(){
  const sb = window.sb;
  async function getUserId(){ return (await sb.auth.getUser()).data?.user?.id; }
  const uid = await getUserId();
  const { data: pf } = await sb.from("portfolios").select("*").eq("user_id", uid);
  if (!pf?.length) return { kinds: [], byKind: new Map(), raw: [] };

  const { data: ttype } = await sb.from("transaction_types").select("id,code");
  const SAV = ttype?.find(t=>t.code==="SAVINGS")?.id;

  const pad2 = n => String(n).padStart(2,"0");
  const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const monthKeysBetween = (fromISO, toISO) => {
    const out=[], [y1,m1]=fromISO.split("-").map(Number), [y2,m2]=toISO.split("-").map(Number);
    for (let y=y1,m=m1; y<y2 || (y===y2 && m<=m2);){ out.push(`${y}-${pad2(m)}`); m++; if(m===13){m=1;y++;} }
    return out;
  };
  function buildSeries({ aprPct, compounding='monthly', initial_amount=0, start_date=null }, txs, fromISO, toISO){
    const r = Number(aprPct||0)/100;
    const months = monthKeysBetween(fromISO.slice(0,7), toISO.slice(0,7));
    const byMonth = new Map(months.map(k=>[k,{contrib:0,interest:0,balance:0}]));
    for(const t of txs){
      const k = String(t.date).slice(0,7);
      if(!byMonth.has(k)) byMonth.set(k,{contrib:0,interest:0,balance:0});
      byMonth.get(k).contrib += Number(t.amount||0);
    }
    let balance = Number(initial_amount||0);
    const annivMonth = start_date ? Number(String(start_date).slice(5,7)) : Number(fromISO.slice(5,7));
    const out=[];
    for (const k of months){
      const row = byMonth.get(k) || {contrib:0,interest:0,balance:0};
      balance += row.contrib;
      let i=0;
      if (compounding === 'monthly') i = balance>0 ? balance*(r/12) : 0;
      else { const m = Number(k.slice(5,7)); if (balance>0 && m===annivMonth) i = balance*r; }
      balance += i;
      row.interest = i; row.balance = balance; out.push({key:k, ...row});
    }
    return out;
  }

  const today = new Date();
  const toISO = ymd(today);
  const out = [];

  for (const p of pf){
    const fromISO = (p.start_date || p.created_at || "1970-01-01").slice(0,10);
    const { data: tx } = await sb
      .from("transactions").select("date,amount")
      .eq("type_id", SAV).eq("portfolio_id", p.id)
      .gte("date", fromISO).lte("date", toISO).order("date",{ascending:true});

    const series = buildSeries(
      { aprPct: p.apr, compounding: p.compounding, initial_amount: Number(p.initial_amount||0), start_date: p.start_date },
      tx||[], fromISO, toISO
    );
    const aportes = (tx||[]).reduce((s,r)=>s+(Number(r.amount)||0),0);
    const invested = Number(p.initial_amount||0) + aportes;
    const current = series.length ? series.at(-1).balance : invested;

    // projeção 12m (sem novos aportes)
    const projTo = new Date(today); projTo.setMonth(projTo.getMonth()+12);
    const projSeries = buildSeries(
      { aprPct: p.apr, compounding: p.compounding, initial_amount: current, start_date: p.start_date },
      [], ymd(today), ymd(projTo)
    );
    const projected = projSeries.length ? projSeries.at(-1).balance : current;

    out.push({ ...p, invested, current, projected });
  }

  const byKind = new Map();
  for (const p of out){
    const k = p.kind || "Outro";
    if(!byKind.has(k)) byKind.set(k,{ invested:0, current:0, projected:0, color: p.color || null });
    const b = byKind.get(k);
    b.invested += p.invested;
    b.current += p.current;
    b.projected += p.projected;
    if (!b.color && p.color) b.color = p.color;
  }
  return { kinds: Array.from(byKind.keys()), byKind, raw: out };
}

  async function renderInvestimentos(){
    titleEl.textContent = "Investimentos por categoria";
    const agg = await _dashFetchPortfoliosAgg();
    const labels = agg.kinds;
    const dataNow = labels.map(k => agg.byKind.get(k)?.current || 0);
    const palette = labels.map((_,i)=>`hsl(${(i*62)%360} 70% 45%)`);

    mount({
      type: "bar",
      data: { labels, datasets: [{ label: "Valor atual", data: dataNow, backgroundColor: palette }] },
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
            { label: kind, data: [invested, projected], backgroundColor: ["#94a3b8", palette[idx]] }
          ];
          chart.options.plugins.legend.display = true;
          chart.update();
          titleEl.textContent = `Investimentos · ${kind}`;
        }
      }
    });
  }

  handlers.gasto_diario_acum = renderGastoDiario; // alias para o mini-card antigo
  console.debug(
    "mini-cards encontrados:",
    [...document.querySelectorAll(".mini-card[data-chart]")].map(
      (b) => b.dataset.chart
    )
  );

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
  try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"); } catch { return []; }
}
function setHiddenCards(arr) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(arr || []));
}
function isHidden(key) {
  return getHiddenCards().some(x => x.key === key);
}
function hideCard(key, title) {
  const set = getHiddenCards();
  if (!set.some(x => x.key === key)) {
    set.push({ key, title });
    setHiddenCards(set);
  }
}
function unhideCard(key) {
  setHiddenCards(getHiddenCards().filter(x => x.key !== key));
}

// Insere botão ❌ e aplica estado visível/oculto
function setupMiniCardHider(outletEl) {
  const cards = [...(outletEl || document).querySelectorAll(".mini-card[data-chart]")];
  cards.forEach(card => {
    const key = card.dataset.chart;
    const title = card.querySelector(".mini-card__title")?.textContent?.trim() || key;

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
        card.style.display = "none";
        // dispara evento global para o Settings atualizar a “prateleira”
        window.dispatchEvent(new CustomEvent("wb:minicard:changed", { detail: { action: "hide", key, title } }));
      });
      card.appendChild(btn);
    }

    // estado inicial
    card.style.display = isHidden(key) ? "none" : "";
  });
}


// =============================== DASHBOARD INIT ===============================
export async function init({ sb, outlet } = {}) {
  sb = sb || window.sb;
  outlet = outlet || document.getElementById("outlet");

  // -------- Chart.js on-demand --------
  async function ensureChartJs() {
    if (window.Chart) return;
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src =
        "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  await ensureChartJs();

  // -------- helpers --------
  const byId = (id) => outlet.querySelector("#" + id);
  const setText = (id, text) => {
    const el = byId(id);
    if (el) el.textContent = text;
  };
  const money = (n) =>
    "€ " +
    Number(n || 0).toLocaleString("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const pad2 = (n) => String(n).padStart(2, "0");
  const yyyMmLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const yyyMmDdLocal = (d) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
    for (let i = n - 1; i >= 0; i--)
      out.push(
        yyyMmLocal(new Date(base.getFullYear(), base.getMonth() - i, 1))
      );
    return out;
  };
  const currentMonthRangeISO = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from: yyyMmDdLocal(start), to: yyyMmDdLocal(end) };
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
      }
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
  const from12Local = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 11);
    return yyyMmDdLocal(d);
  })();

  let monthly = [];
  let fixedVarByMonth = new Map();
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
        const map = new Map(
          data.map((r) => [
            monthKeyFromRow(r.month),
            {
              income: +r.income || 0,
              expense: +r.expense || 0,
              savings: +r.savings || 0,
              net: +r.net || 0,
            },
          ])
        );
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
        monthly = monthsKeys.map((k) => ({
          key: k,
          label: labelMonthPT(k),
          ...(agg.get(k) || { income: 0, expense: 0, savings: 0, net: 0 }),
        }));
      } catch (e) {}
    }

    // ------- Fixas/Variáveis + Top categorias + Pais -------
    try {
      const { data: ttypeExp } = await sb
        .from("transaction_types")
        .select("id,code")
        .eq("code", "EXPENSE")
        .single();
      const expTypeId = ttypeExp?.id ?? -999;

      let hasTxNature = true,
        hasCatNature = true;
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
        "category_id",
        hasTxNature ? "expense_nature" : null,
        hasCatNature
          ? "categories(expense_nature_default,name,parent_id)"
          : "categories(name,parent_id)",
      ]
        .filter(Boolean)
        .join(",");

      const { data } = await sb
        .from("transactions")
        .select(cols)
        .eq("type_id", expTypeId)
        .gte("date", from12Local)
        .order("date", { ascending: true });

      const parentsMap = new Map();
      try {
        const { data: cats } = await sb
          .from("categories")
          .select("id,name,parent_id");
        (cats || []).forEach((c) =>
          parentsMap.set(c.id, { name: c.name, parent_id: c.parent_id })
        );
      } catch {}

      const catPath = (id, rowCat = null) => {
        if (!id && !rowCat) return "(Sem categoria)";
        if (rowCat?.parent_id && rowCat?.name) {
          const p = parentsMap.get(rowCat.parent_id);
          return (p?.name ? p.name + " > " : "") + rowCat.name;
        }
        if (rowCat?.name) return rowCat.name;
        const c = parentsMap.get(id);
        if (!c) return "(Sem categoria)";
        if (!c.parent_id) return c.name;
        const p = parentsMap.get(c.parent_id);
        return (p?.name ? p.name + " > " : "") + c.name;
      };

      const parentNameOf = (row) => {
        const rc = row.categories;
        if (rc?.parent_id) {
          const p = parentsMap.get(rc.parent_id);
          return p?.name || "(Sem categoria)";
        }
        return rc?.name || "(Sem categoria)";
      };

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
      const looksFixed = (name) =>
        FIXED_HINTS.some((h) => (name || "").toLowerCase().includes(h));
      const isFixed = (row) => {
        const tx = hasTxNature ? row.expense_nature : null;
        const catDef = hasCatNature
          ? row.categories?.expense_nature_default
          : null;
        const val = (tx || catDef || "").toLowerCase();
        if (val) return ["fixed", "fixa", "f", "mensal"].includes(val);
        return looksFixed(catPath(row.category_id, row.categories));
      };

      fixedVarByMonth = new Map();
      thisMonthAgg = { fixed: 0, variable: 0 };
      topCatThisMonth = new Map();
      const parentAgg12m = new Map();

      const { from: monthStart, to: monthEnd } = currentMonthRangeISO();

      (data || []).forEach((r) => {
        const k = String(r.date).slice(0, 7);
        const fv = fixedVarByMonth.get(k) || { fixed: 0, variable: 0 };
        const amt = Number(r.amount || 0);
        if (isFixed(r)) fv.fixed += amt;
        else fv.variable += amt;
        fixedVarByMonth.set(k, fv);

        const pname = parentNameOf(r);
        parentAgg12m.set(pname, (parentAgg12m.get(pname) || 0) + amt);

        if (r.date >= monthStart && r.date < monthEnd) {
          const kcat = catPath(r.category_id, r.categories);
          topCatThisMonth.set(kcat, (topCatThisMonth.get(kcat) || 0) + amt);
          if (isFixed(r)) thisMonthAgg.fixed += amt;
          else thisMonthAgg.variable += amt;
        }
      });

      const parentArr = Array.from(parentAgg12m.entries()).sort(
        (a, b) => b[1] - a[1]
      );
      const top = parentArr.slice(0, 9);
      const other = parentArr.slice(9).reduce((s, [, v]) => s + v, 0);
      parentDist.labels = top
        .map(([n]) => n)
        .concat(other > 0 ? ["Outras"] : []);
      parentDist.values = top
        .map(([, v]) => v)
        .concat(other > 0 ? [other] : []);
    } catch {}

    // ------- Métodos (120d) -------
    try {
      const d = new Date();
      d.setDate(d.getDate() - 120);
      const { data } = await sb
        .from("transactions")
        .select("amount, payment_methods(name_pt)")
        .gte("date", yyyMmDdLocal(d));
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
        (k) => agg.get(k) || 0
      );
    } catch {}
  }


  //====== Mini-Card: Investimentos ======//
  // ===== Investimentos (portfolios) – helpers locais =====
async function dashGetUserId() {
  return (await sb.auth.getUser()).data?.user?.id;
}
function dashPad2(n){ return String(n).padStart(2,"0"); }
function dashYmd(d){ return `${d.getFullYear()}-${dashPad2(d.getMonth()+1)}-${dashPad2(d.getDate())}`; }
function dashMonthKeysBetween(fromISO, toISO){
  const out=[], [y1,m1]=fromISO.split("-").map(Number), [y2,m2]=toISO.split("-").map(Number);
  for (let y=y1,m=m1; y<y2 || (y===y2 && m<=m2);){ out.push(`${y}-${dashPad2(m)}`); m++; if(m===13){m=1;y++;}}
  return out;
}
function dashBuildSeries({ aprPct, compounding='monthly', initial_amount=0, start_date=null }, txs, fromISO, toISO){
  const r = Number(aprPct||0)/100;
  const months = dashMonthKeysBetween(fromISO.slice(0,7), toISO.slice(0,7));
  const byMonth = new Map(months.map(k=>[k,{contrib:0,interest:0,balance:0}]));
  for(const t of txs){
    const k = String(t.date).slice(0,7);
    if(!byMonth.has(k)) byMonth.set(k,{contrib:0,interest:0,balance:0});
    byMonth.get(k).contrib += Number(t.amount||0);
  }
  let balance = Number(initial_amount||0);
  const annivMonth = start_date ? Number(String(start_date).slice(5,7)) : Number(fromISO.slice(5,7));
  const out=[];
  for(const k of months){
    const row = byMonth.get(k) || {contrib:0,interest:0,balance:0};
    balance += row.contrib;
    let i = 0;
    if (compounding === 'monthly') i = balance>0 ? balance*(r/12) : 0;
    else { const m = Number(k.slice(5,7)); if (balance>0 && m===annivMonth) i = balance*r; }
    balance += i;
    row.interest = i; row.balance = balance; out.push({key:k, ...row});
  }
  return out;
}
async function dashFetchPortfoliosAgg(){
  const uid = await dashGetUserId();
  const { data: pf } = await sb.from("portfolios").select("*").eq("user_id", uid);
  if (!pf?.length) return { kinds: [], byKind: new Map(), raw: [] };

  const { data: ttype } = await sb.from("transaction_types").select("id,code");
  const SAV = ttype?.find(t=>t.code==="SAVINGS")?.id;

  const today = new Date();
  const toISO = dashYmd(today);

  const out = [];
  for (const p of pf){
    const fromISO = (p.start_date || p.created_at || "1970-01-01").slice(0,10);
    const { data: tx } = await sb
      .from("transactions").select("date,amount")
      .eq("type_id", SAV).eq("portfolio_id", p.id)
      .gte("date", fromISO).lte("date", toISO).order("date",{ascending:true});
    const series = dashBuildSeries(
      { aprPct: p.apr, compounding: p.compounding, initial_amount: Number(p.initial_amount||0), start_date: p.start_date },
      tx||[], fromISO, toISO
    );
    const aportes = (tx||[]).reduce((s,r)=>s+(Number(r.amount)||0),0);
    const invested = Number(p.initial_amount||0) + aportes;
    const current = series.length ? series.at(-1).balance : invested;

    // projeção: +12 meses, sem novos aportes (só juros)
    const projTo = new Date(today); projTo.setMonth(projTo.getMonth()+12);
    const projSeries = dashBuildSeries(
      { aprPct: p.apr, compounding: p.compounding, initial_amount: current, start_date: p.start_date },
      [], dashYmd(today), dashYmd(projTo)
    );
    const projected = projSeries.length ? projSeries.at(-1).balance : current;

    out.push({ ...p, invested, current, projected });
  }

  const byKind = new Map();
  for (const p of out){
    const k = p.kind || "Outro";
    if(!byKind.has(k)) byKind.set(k,{ invested:0, current:0, projected:0, color: p.color || null });
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
      ])
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
      (monthly[monthly.length - 1] || {}).expense || 0
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
      i >= todayIdx ? rate * (i + 1) : null
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
    false
  );
  setPill(
    "kpi-savings-trend",
    pct(Math.abs(latest.savings), Math.abs(prev.savings)),
    true
  );
  setPill("kpi-net-trend", pct(latest.net, prev.net), true);

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

  // Cashflow (acumulado)
  const netCum = [],
    savCum = [];
  monthly.reduce((acc, m, i) => (netCum[i] = acc + m.net), 0);
  monthly.reduce((acc, m, i) => (savCum[i] = acc + Math.abs(m.savings)), 0);
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

  // =========== Próximas despesas (30 dias) ===========
  (async function () {
    try {
      let rows = [];
      if (HAS_SB) {
        const { data: ttype } = await sb
          .from("transaction_types")
          .select("id,code")
          .eq("code", "EXPENSE")
          .single();
        const expId = ttype?.id || -999;

        const back = new Date();
        back.setMonth(back.getMonth() - 18);
        back.setDate(1);
        const { data } = await sb
          .from("transactions")
          .select(
            "date, amount, category_id, categories(name,parent_id), regularities(name_pt,code)"
          )
          .eq("type_id", expId)
          .gte("date", yyyMmDdLocal(back))
          .order("date", { ascending: false });
        rows = data || [];
      }
      const byCat = new Map();
      const catParents = new Map();
      if (HAS_SB) {
        try {
          const { data: cats } = await sb
            .from("categories")
            .select("id,name,parent_id");
          (cats || []).forEach((c) => catParents.set(c.id, c));
        } catch {}
      }
      const catPathName = (row) => {
        const child = row.categories?.name;
        const pid = row.categories?.parent_id;
        const p = pid ? catParents.get(pid) : null;
        return p?.name ? `${p.name} > ${child}` : child || "(Sem categoria)";
      };
      const periodMonths = (reg) => {
        const s = (reg?.code || reg?.name_pt || "").toString().toLowerCase();
        if (/anual|annual|year/.test(s)) return 12;
        if (/semestr/.test(s)) return 6;
        if (/trimestr|quarter/.test(s)) return 3;
        if (/bimestr|bi-?mensal/.test(s)) return 2;
        if (/mensal|month/.test(s)) return 1;
        return 0;
      };
      const today = new Date();
      const in30 = new Date();
      in30.setDate(in30.getDate() + 30);

      (rows || []).forEach((r) => {
        const months = periodMonths(r.regularities);
        if (!months) return;
        const key = `${r.category_id}|${months}`;
        const d = new Date(r.date);
        const prev = byCat.get(key);
        if (!prev || d > prev.lastDate) {
          byCat.set(key, {
            lastDate: d,
            amount: Number(r.amount || 0),
            name: catPathName(r),
            regLabel: r.regularities?.name_pt || r.regularities?.code || "Fixa",
            months,
          });
        }
      });

      const upcoming = [];
      for (const v of byCat.values()) {
        const next = new Date(v.lastDate);
        next.setMonth(next.getMonth() + v.months);
        if (next >= today && next <= in30) {
          const daysLeft = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
          upcoming.push({ ...v, next, daysLeft });
        }
      }
      upcoming.sort((a, b) => a.next - b.next);

      const box = outlet.querySelector("#upcoming-fixed-list");
      if (box) {
        if (!upcoming.length) {
          box.innerHTML = `<div class="muted">Sem despesas fixas previstas nos próximos 30 dias.</div>`;
        } else {
          const statusClass = (days) =>
            days <= 5 ? "danger" : days <= 15 ? "warn" : "ok";
          const statusDotColor = (cls) =>
            cls === "danger"
              ? "#ef4444"
              : cls === "warn"
              ? "#facc15"
              : "#64748b";
          box.innerHTML = upcoming
            .map((u) => {
              const dateStr = u.next.toLocaleDateString("pt-PT", {
                day: "2-digit",
                month: "short",
              });
              const cls = statusClass(u.daysLeft);
              const color = statusDotColor(cls);
              return `<div class="cat-item ${cls}">
              <div class="cat-left">
                <span class="cat-dot" style="background:${color}"></span>
                <div>
                  <div class="cat-name">${u.name}</div>
                  <div class="cat-meta">${u.regLabel} • em ${u.daysLeft} dia${
                u.daysLeft === 1 ? "" : "s"
              }</div>
                </div>
              </div>
              <div class="cat-right" style="text-align:right">
                <div class="cat-amount">${money(u.amount)}</div>
                <div class="cat-avg" style="display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid ${color};">${dateStr}</div>
              </div>
            </div>`;
            })
            .join("");
        }
      }
    } catch (e) {
      const box = outlet.querySelector("#upcoming-fixed-list");
      if (box)
        box.innerHTML = `<div class="muted">Não foi possível carregar as próximas despesas.</div>`;
      console.warn("upcoming fixed error:", e);
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
              return (
                "€ " +
                Number(v).toLocaleString("pt-PT", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              );
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
                return ` ${ctx.dataset.label}: € ${Number(v).toLocaleString(
                  "pt-PT",
                  { minimumFractionDigits: 2 }
                )} (${p})`;
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
            v
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
        (_, i) => COLORS[i % COLORS.length]
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
            const pct = totalParents ? (val / totalParents) * 100 : 0;
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

      const pie = new Chart(ctx, {
        type: "pie",
        data: {
          labels: parentDist.labels || [],
          datasets: [{ data: parentDist.values || [], backgroundColor: bg }],
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
                  const p = ((v / totalParents) * 100).toFixed(1);
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

    // === LISTA DETALHADA (pai > filho, 12m) ===
    const box = document.getElementById("cat-list");
    if (!box) return;

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

    // Reutiliza se já existir noutro bloco
    let catAgg12m = window.catAgg12m instanceof Map ? window.catAgg12m : null;
    let catCount12m =
      window.catCount12m instanceof Map ? window.catCount12m : null;

    // Se não existir, agrega agora a partir da Supabase
    if (
      (!catAgg12m || !catCount12m) &&
      window.sb &&
      typeof window.sb.from === "function"
    ) {
      try {
        // id do tipo 'EXPENSE'
        const { data: ttype } = await sb
          .from("transaction_types")
          .select("id,code")
          .eq("code", "EXPENSE")
          .single();
        const expId = ttype?.id ?? -999;

        // 12 meses de despesas (com categoria)
        const { data: rows } = await sb
          .from("transactions")
          .select("amount, category_id, categories(name,parent_id)")
          .eq("type_id", expId)
          .gte("date", from12Local)
          .order("date", { ascending: true });

        // mapa de categorias para descobrir o pai
        const parentsMap = new Map();
        try {
          const { data: cats } = await sb
            .from("categories")
            .select("id,name,parent_id");
          (cats || []).forEach((c) => parentsMap.set(c.id, c));
        } catch {}

        // monta "Pai > Filho"
        const pathFromRow = (row) => {
          const child = row.categories?.name;
          const pid = row.categories?.parent_id;
          const p = pid ? parentsMap.get(pid) : null;
          return p?.name ? `${p.name} > ${child}` : child || "(Sem categoria)";
        };

        const agg = new Map();
        const cnt = new Map();

        (rows || []).forEach((r) => {
          // normaliza sinal para despesas negativas
          const amt = Math.abs(Number(r.amount || 0));
          if (!amt) return;
          const name = pathFromRow(r);
          agg.set(name, (agg.get(name) || 0) + amt);
          cnt.set(name, (cnt.get(name) || 0) + 1);
        });

        catAgg12m = agg;
        catCount12m = cnt;
        // expõe globalmente
        window.catAgg12m = agg;
        window.catCount12m = cnt;
      } catch (e) {
        console.warn("catAgg12m/catCount12m (SB) falhou:", e);
      }
    }

    // Fallback demo (se não houver SB): usa mês * 12 e 1 registo por categoria
    if (!catAgg12m || !catCount12m) {
      const demoAgg = new Map(
        Array.from((topCatThisMonth || new Map()).entries()).map(([k, v]) => [
          k,
          (v || 0) * 12,
        ])
      );
      const demoCnt = new Map(Array.from(demoAgg.keys()).map((k) => [k, 1]));
      catAgg12m = demoAgg;
      catCount12m = demoCnt;
    }

    // ordenação + percentagens
    const arr = Array.from(catAgg12m.entries()).sort((a, b) => b[1] - a[1]);
    const totalAnual = arr.reduce((s, [, v]) => s + (v || 0), 0) || 1;
    const monthsCount = 12;

    box.innerHTML = arr
      .map(([name, totalVal], i) => {
        const total = Number(totalVal || 0);
        const pct = (total / totalAnual) * 100;
        const avgMes = total / monthsCount;
        const n = Math.max(1, Number(catCount12m.get(name) || 0));
        const avgReg = total / n;
        const color = COLORS[i % COLORS.length];

        return `<div class="cat-item">
      <div class="cat-left">
        <span class="cat-dot" style="background:${color}"></span>
        <div>
          <div class="cat-name">${name}</div>
          <div class="cat-meta">${pct.toFixed(
            1
          )}% do total de despesas (12m)</div>
        </div>
      </div>
      <div class="cat-right" style="text-align:right">
        <div class="cat-amount">${money(
          total
        )}<span class="muted">/ano</span></div>
        <div class="cat-avg">
          ${money(avgMes)}<span class="muted">/mês</span>
          &nbsp;|&nbsp;
          ${money(avgReg)}<span class="muted">/registo</span>
        </div>
      </div>
    </div>`;
      })
      .join("");
  })();

  // Ajuda FAB
  (function mountHelpForDashboard() {
    let btn = document.getElementById("help-fab");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "help-fab";
      btn.className = "help-fab";
      btn.title = "Ajuda deste ecrã";
      btn.innerHTML = `<svg aria-hidden="true"><use href="#i-info"></use></svg>`;
      document.body.appendChild(btn);
    }
    let pop = document.getElementById("help-pop");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "help-pop";
      pop.className = "help-pop hidden";
      document.body.appendChild(pop);
    }
    pop.innerHTML = `
      <h3>O que mostra este ecrã?</h3>
      <p>· KPIs do mês corrent.</p>
      <p>· Análises Anuais e Mensais arrumados em mini cartões. Podem ser ocultados e repostos no screen Definições.</p>
      <p>· Cartão com as datas e despesas fixas agendadas com base nos últimos registos.</p>
      <p>· Podem ser também consultado neste screen as despesas acumuladoas por ano/mês e média por registos.</p>
      <button class="close" type="button">Fechar</button>
    `;
    btn.onclick = () => pop.classList.toggle("hidden");
    pop
      .querySelector(".close")
      ?.addEventListener("click", () => pop.classList.add("hidden"));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") pop.classList.add("hidden");
    });
  })();

  // limpar charts ao sair
  window.addEventListener("hashchange", () => {
    if (!location.hash.startsWith("#/")) destroyCharts();
  });

  // ====== Colapsáveis com SVG inline (após título) ======
  (function enhanceCollapsibles(root = document) {
    const LS_KEY = "wb:dash:collapsed";
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");

    root
      .querySelectorAll("section.card[data-collapsible]")
      .forEach((card, idx) => {
        const titleEl = card.querySelector(
          ":scope > .section-title, :scope > h2.section-title"
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
          collapsed ? "Abrir secção" : "Fechar secção"
        );
        btn.innerHTML = collapsed ? btn.dataset.iconDown : btn.dataset.iconUp;

        btn.addEventListener("click", () => {
          card.classList.toggle("is-collapsed");
          const isCollapsed = card.classList.contains("is-collapsed");
          btn.setAttribute("aria-expanded", String(!isCollapsed));
          btn.setAttribute(
            "aria-label",
            isCollapsed ? "Abrir secção" : "Fechar secção"
          );
          btn.innerHTML = isCollapsed
            ? btn.dataset.iconDown
            : btn.dataset.iconUp;
          saved[key] = isCollapsed ? 1 : 0;
          localStorage.setItem(LS_KEY, JSON.stringify(saved));
          if (!isCollapsed)
            setTimeout(() => window.dispatchEvent(new Event("resize")), 120);
        });
      });
  })();

  // ====== Mini-cards + modal ======
  try {
    if (document.querySelector(".dash-mini")) {
      const fixed12m = monthly.map(
        (m) => fixedVarByMonth.get(m.key || m.label)?.fixed || 0
      );
      const variable12m = monthly.map(
        (m) => fixedVarByMonth.get(m.key || m.label)?.variable || 0
      );

      const dsMini = {
        labels12m: monthly.map((m) => m.label),
        income12m: monthly.map((m) => m.income),
        expense12m: monthly.map((m) => m.expense),
        savings12m: monthly.map((m) => m.savings),
        saldo12m: monthly.map((m) => m.net),

        fixed12m: monthly.map(
          (m) => fixedVarByMonth.get(m.key || m.label)?.fixed || 0
        ),
        variable12m: monthly.map(
          (m) => fixedVarByMonth.get(m.key || m.label)?.variable || 0
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
      };

      setupDashboardModal(dsMini);
    }
  } catch (e) {
    console.warn("mini-cards wiring falhou:", e);
  }

setupMiniCardHider(outlet);
}
