// src/screens/dashboard.js
export async function init({ sb, outlet } = {}) {
  sb = sb || window.sb;
  outlet = outlet || document.getElementById("outlet");

  const DEBUG = false;
  const log = (...a) => {
    if (DEBUG) console.log("[dashboard]", ...a);
  };

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
  const monthKeyFromRow = (rowMonth) => String(rowMonth).slice(0, 7);
  const labelMonthPT = (isoYYYYMM) => {
    const [y, m] = isoYYYYMM.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-PT", {
      month: "short",
      year: "numeric",
    });
  };

  // ===================== PRIVACIDADE KPIs (NOVO) =====================
  const PRIV_KEY = "wb:kpi:hidden";
  let kpiHidden = localStorage.getItem(PRIV_KEY) === "1";
  const maskDigits = (s) => String(s).replace(/\d/g, "*");

  // escreve o valor num KPI e guarda o texto real
  function setKpi(id, text) {
    const el = byId(id);
    if (!el) return;
    el.dataset.raw = text;
    el.textContent = kpiHidden ? maskDigits(text) : text;
  }

  // atualiza o botão “olho”
  function updateKpiEyeBtn() {
    const btn = outlet.querySelector("#kpi-privacy-toggle");
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(kpiHidden));
    const use = btn.querySelector("use");
    if (use) use.setAttribute("href", kpiHidden ? "#i-eye-off" : "#i-eye");
    btn.title = kpiHidden ? "Mostrar valores" : "Ocultar valores";
    btn.setAttribute("aria-label", btn.title);
  }

  // toggle ao clicar no “olho”
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
  // ================================================================

  function lastNMonthsKeys(n) {
    const out = [];
    const base = new Date();
    base.setDate(1);
    base.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--)
      out.push(
        yyyMmLocal(new Date(base.getFullYear(), base.getMonth() - i, 1))
      );
    return out;
  }

  function currentMonthRangeISO() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from: yyyMmDdLocal(start), to: yyyMmDdLocal(end) };
  }

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

  // ===================== 1) KPIs + séries 12m =====================
  const monthsKeys = lastNMonthsKeys(12);
  const from12Local = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 11);
    return yyyMmDdLocal(d);
  })();

  async function getMonthlyViaView() {
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
          income: Number(r.income || 0),
          expense: Number(r.expense || 0),
          savings: Number(r.savings || 0),
          net: Number(r.net || 0),
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
  }

  async function getMonthlyFallback() {
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
    return monthsKeys.map((k) => ({
      key: k,
      label: labelMonthPT(k),
      ...(agg.get(k) || { income: 0, expense: 0, savings: 0, net: 0 }),
    }));
  }

  let monthly = await getMonthlyViaView();
  if (!monthly) monthly = await getMonthlyFallback();

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

  // (alterado) usar setKpi para respeitar a privacidade
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

  // gráfico 12m (receitas/despesas/poupanças + saldo)
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

  // ========= Cashflow anual (acumulado) =========
  const netCum = [];
  const savCum = [];
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

  // ================= 2) Fixas vs Variáveis (resto igual) =================
  let hasTxNature = true,
    hasCatNature = true;
  try {
    await sb.from("transactions").select("id, expense_nature").limit(1);
  } catch {
    hasTxNature = false;
  }
  try {
    await sb.from("categories").select("id, expense_nature_default").limit(1);
  } catch {
    hasCatNature = false;
  }

  const { data: ttypeExp } = await sb
    .from("transaction_types")
    .select("id,code")
    .eq("code", "EXPENSE")
    .single();
  const expTypeId = ttypeExp?.id ?? -999;

  const { from: monthStart, to: monthEnd } = currentMonthRangeISO();
  const from12LocalExpenses = from12Local;

  let exp12 = [];
  try {
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
      .gte("date", from12LocalExpenses)
      .order("date", { ascending: true });
    exp12 = data || [];
  } catch (e) {
    log("despesas 12m error:", e);
  }

  // mapa categorias para "Pai > Filho"
  const cParents = new Map();
  try {
    const { data: cats } = await sb
      .from("categories")
      .select("id,name,parent_id");
    (cats || []).forEach((c) =>
      cParents.set(c.id, { name: c.name, parent_id: c.parent_id })
    );
  } catch {}

  const catPath = (id, rowCat = null) => {
    if (!id && !rowCat) return "(Sem categoria)";
    if (rowCat?.parent_id && rowCat?.name) {
      const p = cParents.get(rowCat.parent_id);
      return (p?.name ? p.name + " > " : "") + rowCat.name;
    }
    if (rowCat?.name) return rowCat.name;
    const c = cParents.get(id);
    if (!c) return "(Sem categoria)";
    if (!c.parent_id) return c.name;
    const p = cParents.get(c.parent_id);
    return (p?.name ? p.name + " > " : "") + c.name;
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
    const catDef = hasCatNature ? row.categories?.expense_nature_default : null;
    const val = (tx || catDef || "").toLowerCase();
    if (val) return ["fixed", "fixa", "f", "mensal"].includes(val);
    return looksFixed(catPath(row.category_id, row.categories));
  };

  const fixedVarByMonth = new Map();
  const thisMonthAgg = { fixed: 0, variable: 0 };
  const topCatThisMonth = new Map();

  exp12.forEach((r) => {
    const k = String(r.date).slice(0, 7);
    const fv = fixedVarByMonth.get(k) || { fixed: 0, variable: 0 };
    const amt = Number(r.amount || 0);
    if (isFixed(r)) fv.fixed += amt;
    else fv.variable += amt;
    fixedVarByMonth.set(k, fv);

    if (r.date >= monthStart && r.date < monthEnd) {
      if (isFixed(r)) thisMonthAgg.fixed += amt;
      else thisMonthAgg.variable += amt;
      const kcat = catPath(r.category_id, r.categories);
      topCatThisMonth.set(kcat, (topCatThisMonth.get(kcat) || 0) + amt);
    }
  });

  const totalExpMonth = thisMonthAgg.fixed + thisMonthAgg.variable;
  setText("kpi-fixed", money(thisMonthAgg.fixed));
  setText("kpi-variable", money(thisMonthAgg.variable));
  setText(
    "kpi-fixed-share",
    totalExpMonth
      ? ((thisMonthAgg.fixed / totalExpMonth) * 100).toFixed(1) + "%"
      : "0%"
  );
  setText(
    "kpi-variable-share",
    totalExpMonth
      ? ((thisMonthAgg.variable / totalExpMonth) * 100).toFixed(1) + "%"
      : "0%"
  );

  // donut mês
  mountChart("chart-fixed-donut", {
    type: "doughnut",
    data: {
      labels: ["Fixas", "Variáveis"],
      datasets: [{ data: [thisMonthAgg.fixed, thisMonthAgg.variable] }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
    },
  });

  // stacked 12m
  (() => {
    const rows = monthsKeys.map((k) => ({
      label: labelMonthPT(k),
      fixed: fixedVarByMonth.get(k)?.fixed || 0,
      variable: fixedVarByMonth.get(k)?.variable || 0,
    }));
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
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true },
        },
      },
    });
  })();

  // top categorias (mês)
  (() => {
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
        scales: { x: { beginAtZero: true } },
      },
    });
  })();

  // =========== Gasto diário acumulado (mês) ===========
  let expMonth = [];
  try {
    const { from, to } = currentMonthRangeISO();
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
    expMonth = (data || []).filter(
      (r) => CODE_BY_ID.get(r.type_id) === "EXPENSE"
    );
  } catch {}

  const dayMap = new Map();
  expMonth.forEach((r) => {
    const d = new Date(r.date);
    const label = d.toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "short",
    });
    dayMap.set(label, (dayMap.get(label) || 0) + Number(r.amount || 0));
  });
  const dayLabels = Array.from(dayMap.keys());
  const cum = [];
  dayLabels.reduce(
    (acc, k, i) => ((cum[i] = acc + (dayMap.get(k) || 0)), cum[i]),
    0
  );

  mountChart("chart-daily-cum", {
    type: "line",
    data: {
      labels: dayLabels,
      datasets: [{ label: "Acumulado", data: cum, fill: true, tension: 0.25 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
    },
  });

  // =========== Métodos de pagamento (120 dias) ===========
  let pmRaw = [];
  try {
    const d = new Date();
    d.setDate(d.getDate() - 120);
    const { data } = await sb
      .from("transactions")
      .select("amount, payment_methods(name_pt)")
      .gte("date", yyyMmDdLocal(d));
    pmRaw = data || [];
  } catch {}
  const pmMap = new Map();
  pmRaw.forEach((r) => {
    const name = r.payment_methods?.name_pt || "Outro";
    pmMap.set(name, (pmMap.get(name) || 0) + Number(r.amount || 0));
  });
  mountChart("chart-methods", {
    type: "bar",
    data: {
      labels: Array.from(pmMap.keys()),
      datasets: [
        {
          label: "Total",
          data: Array.from(pmMap.keys()).map((k) => pmMap.get(k) || 0),
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { beginAtZero: true } },
    },
  });

  // =========== Regularidades (mês) ===========
  (async () => {
    const { data: ttypeExp } = await sb
      .from("transaction_types")
      .select("id,code")
      .eq("code", "EXPENSE")
      .single();
    const expTypeId = ttypeExp?.id ?? -999;
    const { from, to } = currentMonthRangeISO();

    let rows = [];
    try {
      const { data } = await sb
        .from("transactions")
        .select("amount, regularities(name_pt,code)")
        .eq("type_id", expTypeId)
        .gte("date", from)
        .lt("date", to);
      rows = data || [];
    } catch {}

    const keyOf = (r) =>
      r.regularities?.name_pt || r.regularities?.code || "Sem regularidade";
    const agg = new Map();
    rows.forEach((r) => {
      const k = keyOf(r);
      agg.set(k, (agg.get(k) || 0) + Number(r.amount || 0));
    });

    const labels = Array.from(agg.keys());
    const values = labels.map((k) => agg.get(k) || 0);
    const total = values.reduce((a, b) => a + b, 0) || 1;

    mountChart("chart-regularities", {
      type: "bar",
      data: { labels, datasets: [{ label: "Total (€)", data: values }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top" } },
        scales: { y: { beginAtZero: true } },
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = Number(ctx.parsed.y || 0);
                const p = ((v / total) * 100).toFixed(1) + "%";
                return ` ${ctx.dataset.label}: € ${v.toLocaleString("pt-PT", {
                  minimumFractionDigits: 2,
                })} (${p})`;
              },
            },
          },
        },
      },
    });

    const legendEl = outlet.querySelector("#regularities-legend");
    if (legendEl) {
      legendEl.innerHTML = labels
        .map((lab, i) => {
          const v = values[i];
          const pct = ((v / total) * 100).toFixed(1);
          return `<div class="rpt-legend__item"><span style="flex:1">${lab}</span>
          <strong>€ ${v.toLocaleString("pt-PT", {
            minimumFractionDigits: 2,
          })}</strong>
          <span style="color:#64748b">&nbsp;(${pct}%)</span></div>`;
        })
        .join("");
    }
  })();

  // =========== Distribuição + lista de categorias ===========
  await buildCategoryAnalysis();

  async function buildCategoryAnalysis() {
    let rows = [];
    try {
      const { data } = await sb
        .from("v_expense_by_category")
        .select("category,total_expense")
        .order("total_expense", { ascending: false });
      if (data?.length)
        rows = data.map((r) => ({
          category: r.category,
          total: Number(r.total_expense || 0),
        }));
    } catch {}

    if (!rows.length) {
      const from = new Date();
      from.setMonth(from.getMonth() - 11);
      from.setDate(1);
      const fromISO = from.toISOString().slice(0, 10);
      const { data: ttype } = await sb
        .from("transaction_types")
        .select("id,code")
        .eq("code", "EXPENSE")
        .single();
      const expId = ttype?.id || -999;
      const { data } = await sb
        .from("transactions")
        .select("amount, categories(name,parent_id)")
        .eq("type_id", expId)
        .gte("date", fromISO);
      const parents = new Map();
      try {
        const { data: cats } = await sb.from("categories").select("id,name");
        (cats || []).forEach((c) => parents.set(c.id, c.name));
      } catch {}
      const acc = new Map();
      (data || []).forEach((r) => {
        const child = r.categories?.name || "(Sem categoria)";
        const parentName = parents.get(r.categories?.parent_id);
        const path = parentName ? `${parentName} > ${child}` : child;
        const v = Number(r.amount || 0);
        acc.set(path, (acc.get(path) || 0) + v);
      });
      rows = Array.from(acc.entries())
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total);
    }
    rows = rows.filter((r) => r.total > 0);

    renderCategoryPie(
      rows,
      rows.reduce((s, r) => s + r.total, 0)
    );
    renderCategoryList(
      rows,
      rows.reduce((s, r) => s + r.total, 0),
      12
    );
  }

  function renderCategoryPie(rows, total) {
    const el = byId("chart-cat-pie");
    const ctx = el?.getContext("2d");
    if (!ctx) return;
    const top = rows.slice(0, 8);
    const other = rows.slice(8).reduce((s, r) => s + r.total, 0);
    const labels = top
      .map((r) => r.category)
      .concat(other > 0 ? ["Outras"] : []);
    const data = top.map((r) => r.total).concat(other > 0 ? [other] : []);
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
    const bg = labels.map((_, i) => COLORS[i % COLORS.length]);

    const PieLabels = {
      id: "pieLabels",
      afterDatasetDraw(chart) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        const ds = chart.data.datasets[0].data;
        ctx.save();
        meta.data.forEach((arc, i) => {
          const val = Number(ds[i] || 0);
          if (!val) return;
          const pct = total ? (val / total) * 100 : 0;
          if (pct < 4) return;
          const label = chart.data.labels[i];
          const angle = (arc.startAngle + arc.endAngle) / 2;
          const r =
            arc.innerRadius + (arc.outerRadius - arc.innerRadius) * 0.72;
          const x = arc.x + Math.cos(angle) * r;
          const y = arc.y + Math.sin(angle) * r;
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

    addChart(
      new Chart(ctx, {
        type: "pie",
        data: { labels, datasets: [{ data, backgroundColor: bg }] },
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
                  const p = total ? ((v / total) * 100).toFixed(1) : "0.0";
                  return `${tt.label}: ${money(v)} (${p}%)`;
                },
              },
            },
          },
        },
        plugins: [PieLabels],
      })
    );
  }

  function renderCategoryList(rows, total, monthsCount) {
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
    box.innerHTML = rows
      .map((r, i) => {
        const pct = total ? (r.total / total) * 100 : 0;
        const avg = r.total / monthsCount;
        const color = COLORS[i % COLORS.length];
        return `<div class="cat-item">
        <div class="cat-left"><span class="cat-dot" style="background:${color}"></span>
          <div><div class="cat-name">${r.category}</div>
          <div class="cat-meta">${pct.toFixed(
            1
          )}% do total de despesas</div></div>
        </div>
        <div class="cat-right"><div class="cat-amount">${money(r.total)}</div>
          <div class="cat-avg">${money(avg)}/mês</div></div>
      </div>`;
      })
      .join("");
  }

  // --- Ajuda do ecrã (Dashboard) ---
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
      <p>KPIs do mês (Receitas, Despesas, Poupanças, Saldo) e análises: série 12 meses com saldo, gráficos pizza das despesas por categoria, donut Despesas Fixas vs Variáveis e barras para as Despesas por Regularidade.</p>
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
  // ====== Colapsar/expandir cartões de gráficos ======
  function enhanceCollapsibles(root = document) {
    const LS_KEY = "wb:dash:collapsed";
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    const hasUp = !!document.getElementById("i-chevron-up");
    const hasDn = !!document.getElementById("i-chevron-down");

    root
      .querySelectorAll("section.card[data-collapsible]")
      .forEach((card, idx) => {
        const titleEl = card.querySelector(
          ":scope > .section-title, :scope > h2.section-title"
        );
        if (!titleEl) return;

        // chave única para persistência
        const key =
          card.dataset.key || titleEl.textContent.trim() || `card-${idx}`;

        // embrulhar todos os irmãos após o título em .card__content (se ainda não existir)
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

        // botão toggle (único)
        let btn = card.querySelector(":scope > .card__toggle");
        if (!btn) {
          btn = document.createElement("button");
          btn.type = "button";
          btn.className = "card__toggle";
          btn.setAttribute("aria-label", "Fechar secção");
          btn.setAttribute("aria-expanded", "true");
          // preferir ícones do sprite; fallback texto
          btn.innerHTML =
            hasUp && hasDn
              ? `<svg aria-hidden="true"><use href="#i-chevron-up"></use></svg>`
              : `<span aria-hidden="true">–</span>`;
          card.appendChild(btn);
        }

        // aplicar estado guardado
        const collapsed = !!saved[key];
        card.classList.toggle("is-collapsed", collapsed);
        btn.setAttribute("aria-expanded", String(!collapsed));
        const use = btn.querySelector("use");
        if (use && hasUp && hasDn)
          use.setAttribute(
            "href",
            collapsed ? "#i-chevron-down" : "#i-chevron-up"
          );
        else if (!hasUp || !hasDn)
          btn.firstChild.textContent = collapsed ? "+" : "–";

        // alternar estado no clique
        btn.addEventListener("click", () => {
          card.classList.toggle("is-collapsed");
          const isCollapsed = card.classList.contains("is-collapsed");
          btn.setAttribute("aria-expanded", String(!isCollapsed));
          if (use && hasUp && hasDn)
            use.setAttribute(
              "href",
              isCollapsed ? "#i-chevron-down" : "#i-chevron-up"
            );
          else btn.firstChild.textContent = isCollapsed ? "+" : "–";
          saved[key] = isCollapsed ? 1 : 0;
          localStorage.setItem(LS_KEY, JSON.stringify(saved));
          if (!isCollapsed)
            setTimeout(() => window.dispatchEvent(new Event("resize")), 120); // reflow Chart.js
        });
      });
  }

  // chama no fim do init, quando o HTML da dashboard já está no outlet
  enhanceCollapsibles(document);
}
