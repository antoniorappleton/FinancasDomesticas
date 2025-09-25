// src/screens/dashboard.js
export async function init({ sb, outlet } = {}) {
  sb = sb || window.sb;
  outlet = outlet || document.getElementById("outlet");

  const DEBUG = false;
  const log = (...a) => { if (DEBUG) console.log("[dashboard]", ...a); };

  // ---------- Chart.js (on-demand) ----------
  async function ensureChartJs() {
    if (window.Chart) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  await ensureChartJs();

  // ---------- helpers ----------
  const bySel = (sel) => outlet.querySelector(sel);
  const byId  = (id)  => outlet.querySelector("#" + id);
  const $ = (selOrId) => (selOrId.startsWith?.("#") ? bySel(selOrId) : byId(selOrId));
  const setText = (id, text) => { const el = byId(id); if (el) el.textContent = text; };

  const money = (n) =>
    "€ " + Number(n || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const pad2 = (n) => String(n).padStart(2, "0");
  const yyyMmLocal   = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
  const yyyMmDdLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const monthKeyFromRow = (rowMonth) => String(rowMonth).slice(0, 7); // "YYYY-MM"
  const labelMonthPT = (isoYYYYMM) => {
    const [y,m] = isoYYYYMM.split("-").map(Number);
    return new Date(y, m-1, 1).toLocaleDateString("pt-PT", { month: "short", year: "numeric" });
  };

  function lastNMonthsKeys(n) {
    const out = [];
    const base = new Date();
    base.setDate(1); base.setHours(0,0,0,0);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      out.push(yyyMmLocal(d));
    }
    return out;
  }

  function currentMonthRangeISO() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from: yyyMmDdLocal(start), to: yyyMmDdLocal(end) };
  }

  // ---------- charts lifecycle ----------
  let charts = [];
  const addChart = (c) => charts.push(c);
  const destroyCharts = () => {
    charts.forEach((c) => { try{ c.destroy(); }catch{} });
    charts = [];
  };
  // mata qualquer chart antigo no mesmo canvas
  const mountChart = (canvasId, config) => {
    const el = byId(canvasId);
    if (!el || !el.getContext) return null;
    try {
      const existing = window.Chart?.getChart?.(el);
      if (existing) existing.destroy();
    } catch {}
    const c = new Chart(el.getContext("2d"), config);
    addChart(c);
    return c;
  };

  destroyCharts(); // evita "Canvas is already in use" ao reentrar no ecrã

  // ================= 1) KPI & Tendências =================
  const monthsKeys = lastNMonthsKeys(12);
  const from12Local = (() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11);
    return yyyMmDdLocal(d);
  })();

  async function getMonthlyViaView() {
    const { data, error } = await sb
      .from("v_monthly_summary")
      .select("month,income,expense,savings,net")
      .gte("month", from12Local)
      .order("month", { ascending: true });

    if (error || !data) {
      log("view error:", error);
      return null;
    }

    const map = new Map(
      data.map(r => [
        monthKeyFromRow(r.month),
        {
          income:  Number(r.income  || 0),   // view já dá sinais coerentes para display
          expense: Number(r.expense || 0),
          savings: Number(r.savings || 0),
          net:     Number(r.net     || 0),
        }
      ])
    );

    const series = monthsKeys.map(k => ({
      key:   k,
      label: labelMonthPT(k),
      income:  map.get(k)?.income  || 0,
      expense: map.get(k)?.expense || 0,
      savings: map.get(k)?.savings || 0,
      net:     map.get(k)?.net     || 0,
    }));

    // se tudo 0 mas existem transações → vamos ao fallback
    const any = series.some(s => s.income || s.expense || s.savings || s.net);
    if (!any) {
      const { count, error: cErr } = await sb
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .gte("date", from12Local);
      if (!cErr && (count || 0) > 0) return null;
    }
    return series;
  }

  async function getMonthlyFallback() {
    // mapear type_id → code
    const { data: types } = await sb.from("transaction_types").select("id,code");
    const TYPE_BY_ID = new Map((types || []).map(t => [t.id, t.code]));

    const { data: tx, error } = await sb
      .from("transactions")
      .select("date, amount, type_id")
      .gte("date", from12Local)
      .order("date", { ascending: true });

    if (error || !tx) {
      log("tx fallback error:", error);
      return monthsKeys.map(k => ({ key:k, label:labelMonthPT(k), income:0, expense:0, savings:0, net:0 }));
    }

    const agg = new Map(); // "YYYY-MM" -> {income,expense,savings,net}
    tx.forEach(r => {
      const k = String(r.date).slice(0,7);
      const a = Number(r.amount || 0);
      const code = TYPE_BY_ID.get(r.type_id);
      if (!k || !code) return;
      const m = agg.get(k) || { income:0, expense:0, savings:0, net:0 };

      if (code === "INCOME")       { m.income  += a; m.net += a; }
      else if (code === "EXPENSE") { m.expense += a; m.net -= a; }
      else if (code === "SAVINGS") { m.savings += a; m.net -= a; } // display: guardamos POS, subtrai no net

      agg.set(k, m);
    });

    return monthsKeys.map(k => {
      const m = agg.get(k) || { income:0, expense:0, savings:0, net:0 };
      return { key:k, label:labelMonthPT(k), ...m };
    });
  }

  let monthly = await getMonthlyViaView();
  if (!monthly) monthly = await getMonthlyFallback();

  const latest = monthly[monthly.length - 1] || { income:0, expense:0, savings:0, net:0 };
  const prev   = monthly[monthly.length - 2] || { income:0, expense:0, savings:0, net:0 };
  const pct = (a,b) => (b ? ((a-b)/Math.abs(b))*100 : 0);

  setText("kpi-income",  money(latest.income));
  setText("kpi-expense", money(Math.abs(latest.expense)));
  setText("kpi-savings", money(Math.abs(latest.savings)));
  setText("kpi-balance", money(latest.net));

  const incG = pct(latest.income, prev.income);
  const expG = pct(Math.abs(latest.expense), Math.abs(prev.expense));
  const incPill = byId("kpi-income-trend");
  const expPill = byId("kpi-expense-trend");
  if (incPill) { incPill.textContent = `${incG>=0?"+":""}${incG.toFixed(1)}%`; incPill.className = "pill " + (incG>=0?"pill--up":"pill--down"); }
  if (expPill) { expPill.textContent = `${expG>=0?"+":""}${expG.toFixed(1)}%`; expPill.className = "pill " + (expG<=0?"pill--up":"pill--down"); }

  // gráfico mensal
  mountChart("chart-monthly", {
    type: "bar",
    data: {
      labels: monthly.map(m => m.label),
      datasets: [
        { type:"bar",  label:"Receitas",  data: monthly.map(m => m.income)  },
        { type:"bar",  label:"Despesas",  data: monthly.map(m => m.expense) },
        { type:"bar",  label:"Poupanças", data: monthly.map(m => m.savings) },
        { type:"line", label:"Saldo",     data: monthly.map(m => m.net), tension:.25, borderWidth:2, fill:false }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:"index", intersect:false },
      plugins:{ legend:{ position:"top" } },
      scales:{ y:{ beginAtZero:true } }
    }
  });

  // ================= 2) Fixas vs Variáveis =================
  let hasTxNature = true, hasCatNature = true;
  try { await sb.from("transactions").select("id, expense_nature").limit(1); } catch { hasTxNature = false; }
  try { await sb.from("categories").select("id, expense_nature_default").limit(1); } catch { hasCatNature = false; }

  const { data: ttypeExp } = await sb.from("transaction_types").select("id,code").eq("code","EXPENSE").single();
  const expTypeId = ttypeExp?.id ?? -999;

  const { from: monthStart, to: monthEnd } = currentMonthRangeISO();
  const from12LocalExpenses = from12Local; // já calculado

  let exp12 = [];
  try {
    const cols = [
      "date","amount","category_id",
      hasTxNature ? "expense_nature" : null,
      hasCatNature ? "categories(expense_nature_default,name,parent_id)" : "categories(name,parent_id)"
    ].filter(Boolean).join(",");
    const { data, error } = await sb
      .from("transactions")
      .select(cols)
      .eq("type_id", expTypeId)
      .gte("date", from12LocalExpenses)
      .order("date", { ascending:true });
    if (error) throw error;
    exp12 = data || [];
  } catch (e) { log("despesas 12m error:", e); }

  // mapa de categorias p/ montar "Pai > Filho"
  const cParents = new Map();
  try {
    const { data } = await sb.from("categories").select("id,name,parent_id");
    (data || []).forEach(c => cParents.set(c.id, { name:c.name, parent_id:c.parent_id }));
  } catch {}

  const catPath = (id, rowCat=null) => {
    if (!id && !rowCat) return "(Sem categoria)";
    if (rowCat?.parent_id && rowCat?.name) {
      const p = cParents.get(rowCat.parent_id);
      return (p?.name ? p.name+" > " : "") + rowCat.name;
    }
    if (rowCat?.name) return rowCat.name;
    const c = cParents.get(id);
    if (!c) return "(Sem categoria)";
    if (!c.parent_id) return c.name;
    const p = cParents.get(c.parent_id);
    return (p?.name ? p.name+" > " : "") + c.name;
  };

  const FIXED_HINTS = ["renda","utilidades","tv + internet","internet","seguro","créditos","mensalidades","assinaturas","telemóveis","empregada","iuc"];
  const looksFixed = (name) => FIXED_HINTS.some(h => (name || "").toLowerCase().includes(h));

  const isFixed = (row) => {
    const tx = hasTxNature ? row.expense_nature : null;
    const catDef = hasCatNature ? row.categories?.expense_nature_default : null;
    const val = (tx || catDef || "").toLowerCase();
    if (val) return ["fixed","fixa","f","mensal"].includes(val);
    return looksFixed(catPath(row.category_id, row.categories));
  };

  const fixedVarByMonth = new Map();
  const thisMonthAgg = { fixed:0, variable:0 };
  const topCatThisMonth = new Map();

  exp12.forEach(r => {
    const k = String(r.date).slice(0,7);
    const fv = fixedVarByMonth.get(k) || { fixed:0, variable:0 };
    const amt = Number(r.amount || 0);
    if (isFixed(r)) fv.fixed += amt; else fv.variable += amt;
    fixedVarByMonth.set(k, fv);

    if (r.date >= monthStart && r.date < monthEnd) {
      if (isFixed(r)) thisMonthAgg.fixed += amt; else thisMonthAgg.variable += amt;
      const kcat = catPath(r.category_id, r.categories);
      topCatThisMonth.set(kcat, (topCatThisMonth.get(kcat)||0) + amt);
    }
  });

  const totalExpMonth = thisMonthAgg.fixed + thisMonthAgg.variable;
  setText("kpi-fixed",    money(thisMonthAgg.fixed));
  setText("kpi-variable", money(thisMonthAgg.variable));
  setText("kpi-fixed-share",    totalExpMonth ? ((thisMonthAgg.fixed/totalExpMonth)*100).toFixed(1)+"%" : "0%");
  setText("kpi-variable-share", totalExpMonth ? ((thisMonthAgg.variable/totalExpMonth)*100).toFixed(1)+"%" : "0%");

  // donut mês
  mountChart("chart-fixed-donut", {
    type: "doughnut",
    data: {
      labels:["Fixas","Variáveis"],
      datasets:[{ data:[thisMonthAgg.fixed, thisMonthAgg.variable] }]
    },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom" } } }
  });

  // stacked 12m
  (() => {
    const rows = monthsKeys.map(k => ({
      label: labelMonthPT(k),
      fixed: fixedVarByMonth.get(k)?.fixed || 0,
      variable: fixedVarByMonth.get(k)?.variable || 0
    }));
    mountChart("chart-fixed-stacked", {
      type:"bar",
      data:{
        labels: rows.map(r => r.label),
        datasets:[
          { label:"Fixas",      data: rows.map(r => r.fixed),    stack:"exp" },
          { label:"Variáveis",  data: rows.map(r => r.variable), stack:"exp" }
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        scales:{ x:{ stacked:true }, y:{ stacked:true, beginAtZero:true } }
      }
    });
  })();

  // top categorias (mês)
  (() => {
    const arr = Array.from(topCatThisMonth.entries())
      .map(([name,total]) => ({name,total}))
      .sort((a,b) => b.total - a.total)
      .slice(0,8);

    mountChart("chart-top-categories", {
      type:"bar",
      data:{
        labels: arr.map(x => x.name),
        datasets:[{ label:"Total", data: arr.map(x => x.total) }]
      },
      options:{
        indexAxis:"y",
        responsive:true, maintainAspectRatio:false,
        scales:{ x:{ beginAtZero:true } }
      }
    });
  })();

  // ================= 3) Gasto diário acumulado (mês) =================
  let expMonth = [];
  try {
    const { from, to } = currentMonthRangeISO();

    const { data: types2 } = await sb.from("transaction_types").select("id,code");
    const CODE_BY_ID = new Map((types2 || []).map(t => [t.id, t.code]));

    const { data, error } = await sb
      .from("transactions")
      .select("date, amount, type_id")
      .gte("date", from).lt("date", to)
      .order("date", { ascending:true });

    if (!error && data) expMonth = data.filter(r => CODE_BY_ID.get(r.type_id) === "EXPENSE");
  } catch (e) { log("daily cum error:", e); }

  const dayMap = new Map(); // "dd MMM" -> total
  expMonth.forEach(r => {
    const d = new Date(r.date);
    const label = d.toLocaleDateString("pt-PT", { day:"2-digit", month:"short" });
    dayMap.set(label, (dayMap.get(label)||0) + Number(r.amount||0));
  });
  const dayLabels = Array.from(dayMap.keys());
  const cum = [];
  dayLabels.reduce((acc, k, i) => (cum[i] = acc + (dayMap.get(k)||0), cum[i]), 0);

  mountChart("chart-daily-cum", {
    type:"line",
    data:{ labels: dayLabels, datasets:[{ label:"Acumulado", data:cum, fill:true, tension:.25 }] },
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } } }
  });

  // ================= 4) Métodos de pagamento (120 dias) =================
  let pmRaw = [];
  try {
    const d = new Date(); d.setDate(d.getDate() - 120);
    const { data, error } = await sb
      .from("transactions")
      .select("amount, payment_methods(name_pt)")
      .gte("date", yyyMmDdLocal(d));
    if (!error && data) pmRaw = data;
  } catch (e) { log("pm error:", e); }

  const pmMap = new Map();
  pmRaw.forEach(r => {
    const name = r.payment_methods?.name_pt || "Outro";
    pmMap.set(name, (pmMap.get(name)||0) + Number(r.amount||0));
  });

  mountChart("chart-methods", {
    type:"bar",
    data:{
      labels: Array.from(pmMap.keys()),
      datasets:[{ label:"Total", data: Array.from(pmMap.keys()).map(k => pmMap.get(k)||0) }]
    },
    options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, scales:{ x:{ beginAtZero:true } } }
  });

  // limpar charts quando saíres da dashboard
  window.addEventListener("hashchange", () => {
    if (!location.hash.startsWith("#/")) destroyCharts();
  });
}
