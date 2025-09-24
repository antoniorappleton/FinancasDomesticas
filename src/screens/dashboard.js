/* Dashboard melhorada — Chart.js + Supabase
   Requisitos:
   - window.sb (supabase client)
   - Chart.js v4 via CDN no index.html
*/
export async function init() {
  // Garante que Chart.js está disponível
  if (!window.Chart) {
    console.error("Chart.js não encontrado. Adiciona <script src='https://cdn.jsdelivr.net/npm/chart.js@4'></script> no index.html");
    return;
  }

  // === cola aqui a versão melhorada da dashboard que já te dei ===
  // Dica: podes simplesmente copiar/colar o ficheiro completo da “Dashboard melhorada — Chart.js + Supabase”
  // que te enviei na mensagem anterior. Ele já trabalha com os elementos deste HTML.
}

(async function () {
  // ---------------- helpers ----------------
  const $ = (sel) => document.querySelector(sel);

  const money = (n) => {
    const v = Number(n || 0);
    return "€ " + v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hexToRgba = (hex, a = 1) => {
    if (!hex) return `rgba(0,0,0,${a})`;
    const h = hex.replace("#", "");
    const bigint = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
    const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
    return `rgba(${r},${g},${b},${a})`;
  };

  const COLORS = {
    income:  cssVar("--income")  || "#16a34a",
    expense: cssVar("--expense") || "#ef4444",
    savings: cssVar("--savings") || "#2563eb",
    balance: cssVar("--balance") || "#065f46",
  };

  const PALETTE = [
    "#0ea5e9","#f97316","#a855f7","#10b981","#eab308","#ef4444",
    "#06b6d4","#84cc16","#f43f5e","#8b5cf6","#22c55e","#f59e0b"
  ];

  const setBusy = (on) => {
    const outlet = $("#outlet");
    outlet.toggleAttribute("aria-busy", !!on);
    outlet.style.opacity = on ? .6 : 1;
  };

  // último N dias -> array de ISO e labels
  const lastNDays = (n) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const dates = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const iso = d.toISOString().slice(0,10);
      const label = d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
      dates.push({ iso, label });
    }
    return dates;
  };

  // chart utils
  let charts = [];
  const destroyCharts = () => { charts.forEach(c => c?.destroy?.()); charts = []; };
  const euroTicks = { ticks: { callback: (v) => "€ " + Number(v).toLocaleString("pt-PT") } };
  const euroTooltip = {
    plugins: {
      tooltip: { callbacks: { label: (ctx) => {
        const v = typeof ctx.parsed === "object" ? (ctx.parsed.y ?? ctx.parsed._custom) : ctx.parsed;
        return `${ctx.dataset.label || ""}: ${money(v)}`;
      }}}
    }
  };

  try {
    setBusy(true);

    // ---------------- queries em paralelo ----------------
    const qMonthly = sb
      .from("v_monthly_summary").select("*")
      .order("month", { ascending: false })
      .limit(24);

    const qCat = sb
      .from("v_expense_by_category")
      .select("*")
      .order("total_expense", { ascending: false });

    const qExpenseType = sb
      .from("transaction_types")
      .select("id,code")
      .eq("code","EXPENSE")
      .single();

    const [monthlyRes, catRes, expenseTypeRes] = await Promise.all([qMonthly, qCat, qExpenseType]);

    if (monthlyRes.error) throw monthlyRes.error;
    if (catRes.error) console.warn(catRes.error); // view pode ainda não existir
    if (expenseTypeRes.error) throw expenseTypeRes.error;

    const monthlyRaw = monthlyRes.data || [];
    const expenseTypeId = expenseTypeRes.data?.id;

    // ---------------- KPIs + gráfico mensal ----------------
    const monthly = monthlyRaw
      .map(r => ({
        monthLabel: new Date(r.month).toLocaleDateString("pt-PT", { month: "short", year: "numeric" }),
        income:  Number(r.income  || 0),
        expense: Math.abs(Number(r.expense || 0)),
        savings: Number(r.savings || 0),
        net:     Number(r.net     || 0),
      }))
      .reverse();

    const latest = monthlyRaw[0] || { income:0, expense:0, savings:0, net:0 };
    $("#kpi-income").textContent  = money(latest.income);
    $("#kpi-expense").textContent = money(Math.abs(latest.expense));
    $("#kpi-savings").textContent = money(latest.savings);
    $("#kpi-balance").textContent = money(latest.net);

    const ctxMonthly = document.getElementById("chart-monthly").getContext("2d");
    charts.push(new Chart(ctxMonthly, {
      type: "bar",
      data: {
        labels: monthly.map(m => m.monthLabel),
        datasets: [
          { type:"bar",  label:"Receitas", data: monthly.map(m => m.income),
            backgroundColor: hexToRgba(COLORS.income, .25), borderColor: COLORS.income, borderWidth: 1 },
          { type:"bar",  label:"Despesas", data: monthly.map(m => m.expense),
            backgroundColor: hexToRgba(COLORS.expense, .25), borderColor: COLORS.expense, borderWidth: 1 },
          { type:"line", label:"Saldo",    data: monthly.map(m => m.net),
            borderColor: COLORS.balance, backgroundColor: hexToRgba(COLORS.balance,.15), fill:false, tension:.35, borderWidth: 2, pointRadius: 2 },
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false, interaction:{ mode:"index", intersect:false },
        plugins:{ legend:{ position:"top" } },
        scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, ...euroTicks } },
        ...euroTooltip
      }
    }));

    // ---------------- categorias (Top N + Outras) ----------------
    const cat = (catRes.data || [])
      .filter(r => Number(r.total_expense) !== 0)
      .map(r => ({ category: r.category || "(Sem categoria)", value: Math.abs(Number(r.total_expense)) }));

    const TOP_N = 7;
    const top = cat.slice(0, TOP_N);
    const rest = cat.slice(TOP_N);
    if (rest.length) top.push({ category: "Outras", value: rest.reduce((s,c)=>s+c.value,0) });

    const ctxCat = document.getElementById("chart-categories").getContext("2d");
    charts.push(new Chart(ctxCat, {
      type: "pie",
      data: {
        labels: top.map(c => c.category),
        datasets: [{
          data: top.map(c => c.value),
          backgroundColor: top.map((_,i)=> PALETTE[i % PALETTE.length]),
          borderColor: "#fff", borderWidth: 2
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { tooltip: { callbacks: {
          label: (ctx) => `${ctx.label}: ${money(ctx.parsed)}`
        }}}
      }
    }));

    // ---------------- gastos diários (últimos 30 dias, só despesas) ----------------
    const last30 = lastNDays(30); // array ordenado cronologicamente
    const { data: expRaw, error: expErr } = await sb
      .from("transactions")
      .select("date, amount")
      .eq("type_id", expenseTypeId)
      .gte("date", last30[0].iso)
      .lte("date", last30[last30.length-1].iso)
      .order("date", { ascending: true });
    if (expErr) console.error(expErr);

    const byISO = Object.create(null);
    (expRaw || []).forEach(r => {
      const iso = String(r.date);
      byISO[iso] = (byISO[iso] || 0) + Number(r.amount || 0);
    });
    const lineLabels = last30.map(d => d.label);
    const lineData = last30.map(d => byISO[d.iso] || 0);

    const ctxDaily = document.getElementById("chart-daily").getContext("2d");
    charts.push(new Chart(ctxDaily, {
      type: "line",
      data: {
        labels: lineLabels,
        datasets: [{
          label: "Gasto diário",
          data: lineData,
          borderColor: COLORS.expense,
          backgroundColor: hexToRgba(COLORS.expense, .25),
          fill: true, tension: .35, pointRadius: 0
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        scales: { y: { beginAtZero:true, ...euroTicks }, x:{ grid:{ display:false } } },
        ...euroTooltip
      }
    }));

    // ---------------- métodos de pagamento (últimos 120 dias, só despesas) ----------------
    const last120 = lastNDays(120);
    const { data: pmRaw, error: pmErr } = await sb
      .from("transactions")
      .select("amount, payment_methods(name_pt), type_id, date")
      .eq("type_id", expenseTypeId)
      .gte("date", last120[0].iso)
      .lte("date", last120[last120.length-1].iso);
    if (pmErr) console.error(pmErr);

    const pmMap = {};
    (pmRaw || []).forEach(r => {
      const name = r.payment_methods?.name_pt || "Outro";
      pmMap[name] = (pmMap[name] || 0) + Number(r.amount || 0);
    });
    const pmEntries = Object.entries(pmMap)
      .map(([method, value]) => ({ method, value }))
      .sort((a,b)=> b.value - a.value);
    const PM_TOP = 6;
    const pmTop = pmEntries.slice(0, PM_TOP);
    const pmRest = pmEntries.slice(PM_TOP);
    if (pmRest.length) pmTop.push({ method: "Outros", value: pmRest.reduce((s,m)=>s+m.value,0) });

    const ctxPM = document.getElementById("chart-methods").getContext("2d");
    charts.push(new Chart(ctxPM, {
      type: "bar",
      data: {
        labels: pmTop.map(x => x.method),
        datasets: [{
          label: "Total",
          data: pmTop.map(x => x.value),
          backgroundColor: hexToRgba(cssVar("--blue-500") || "#3b82f6", .25),
          borderColor: cssVar("--blue-500") || "#3b82f6",
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: "y",
        responsive:true, maintainAspectRatio:false,
        scales: { x: { beginAtZero:true, ...euroTicks }, y: { grid:{ display:false } } },
        ...euroTooltip
      }
    }));

    // limpar quando sair da página
    const onHash = () => {
      if (!location.hash.includes("dashboard")) {
        destroyCharts();
        window.removeEventListener("hashchange", onHash);
      }
    };
    window.addEventListener("hashchange", onHash);

  } catch (e) {
    console.error(e);
    // Mensagem amigável
    const outlet = $("#outlet");
    const box = document.createElement("div");
    box.className = "card";
    box.innerHTML = `<p><strong>Não foi possível carregar a dashboard.</strong></p>
      <p style="color:#6b7280">Verifica a sessão e se as <code>views</code> existem: <code>v_monthly_summary</code> e <code>v_expense_by_category</code>.</p>`;
    outlet.prepend(box);
  } finally {
    setBusy(false);
  }
})();