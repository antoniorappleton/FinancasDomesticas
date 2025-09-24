export async function init() {
  const sb = window.sb;

  // destrói gráficos antigos do ecrã (evita “canvas in use”)
  const CHART_IDS = ["chart-monthly","chart-categories","chart-daily","chart-methods"];
  function destroyAll() {
    CHART_IDS.forEach(id => {
      const c = window.Chart?.getChart?.(id);
      if (c) c.destroy();
    });
  }
  // limpa ao entrar e ao navegar para fora
  destroyAll();
  if (!window.__dash_cleanup_registered) {
    window.__dash_cleanup_registered = true;
    window.addEventListener("hashchange", destroyAll);
  }

  // criar gráfico com limpeza prévia por ID
  function createChart(id, cfg) {
    const el = document.getElementById(id);
    if (!el) return null;
    const prev = window.Chart?.getChart?.(id); // usa o ID da <canvas>
    if (prev) prev.destroy();
    return new Chart(el.getContext("2d"), cfg);
  }

  // helpers
  const money = (n) => "€ " + Number(n||0).toLocaleString("pt-PT",{minimumFractionDigits:2, maximumFractionDigits:2});
  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const lastNDaysISO = (n) => { const d=new Date(); d.setHours(0,0,0,0); const f=new Date(d); f.setDate(f.getDate()-(n-1)); return {fromISO:f.toISOString().slice(0,10), toISO:d.toISOString().slice(0,10)}; };

  // 1) monthly summary
  const { data: monthlyRaw, error: monthlyErr } = await sb
    .from("v_monthly_summary").select("*").order("month", { ascending:false }).limit(24);

  if (monthlyErr) { console.error(monthlyErr); return; }

  const monthly = (monthlyRaw||[]).map(r=>({
    label: new Date(r.month).toLocaleDateString("pt-PT",{month:"short",year:"numeric"}),
    income:  Number(r.income||0),
    expense: Math.abs(Number(r.expense||0)),
    savings: Math.abs(Number(r.savings||0)),
    net:     Number(r.net||0),
  })).reverse();

  const latest = monthlyRaw?.[0] || {};
  setText("kpi-income",  money(latest.income  || 0));
  setText("kpi-expense", money(latest.expense || 0));
  setText("kpi-savings", money(latest.savings || 0));
  setText("kpi-balance", money(latest.net     || 0));

  createChart("chart-monthly", {
    type: "bar",
    data: {
      labels: monthly.map(m=>m.label),
      datasets: [
        { type:"bar",  label:"Receitas", data: monthly.map(m=>m.income) },
        { type:"bar",  label:"Despesas", data: monthly.map(m=>m.expense) },
        { type:"line", label:"Saldo",    data: monthly.map(m=>m.net), tension:.3, borderWidth:2, fill:false }
      ]
    },
    options: { responsive:true, maintainAspectRatio:false, interaction:{mode:"index",intersect:false}, plugins:{legend:{position:"top"}}, scales:{y:{beginAtZero:true}} }
  });

  // 2) categories (ano)
  const { data: catRaw, error: catErr } = await sb
    .from("v_expense_by_category").select("*").order("total_expense", { ascending:false });
  if (!catErr) {
    const cat = (catRaw||[]).filter(r=>Number(r.total_expense)!==0);
    createChart("chart-categories", {
      type:"pie",
      data:{ labels: cat.map(c=>c.category), datasets:[{ data: cat.map(c=>Math.abs(Number(c.total_expense))) }] },
      options:{ responsive:true, maintainAspectRatio:false }
    });
  }

  // 3) daily last 30 (EXPENSE)
  const { data: tt } = await sb.from("transaction_types").select("id,code").eq("code","EXPENSE").single();
  const { fromISO, toISO } = lastNDaysISO(30);
  const { data: expRaw } = await sb.from("transactions")
    .select("date,amount").eq("type_id", tt?.id || -999).gte("date", fromISO).lte("date", toISO).order("date",{ascending:true});
  const dayMap = {};
  (expRaw||[]).forEach(r=>{
    const label = new Date(r.date).toLocaleDateString("pt-PT",{day:"2-digit",month:"short"});
    dayMap[label] = (dayMap[label]||0) + Number(r.amount||0);
  });
  const days = Object.keys(dayMap);
  createChart("chart-daily", {
    type:"line",
    data:{ labels: days, datasets:[{ label:"Gasto diário", data: days.map(d=>dayMap[d]), fill:true, tension:.3 }] },
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } } }
  });

  // 4) payment methods (120d)
  const { fromISO: from120 } = lastNDaysISO(120);
  const { data: pmRaw } = await sb.from("transactions")
    .select("amount, payment_method_id, payment_methods(name_pt)").gte("date", from120);
  const pmMap = {};
  (pmRaw||[]).forEach(r=>{
    const name = r.payment_methods?.name_pt || "Outro";
    pmMap[name] = (pmMap[name]||0) + Number(r.amount||0);
  });
  const labels = Object.keys(pmMap);
  createChart("chart-methods", {
    type:"bar",
    data:{ labels, datasets:[{ label:"Total", data: labels.map(k=>pmMap[k]) }] },
    options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, scales:{ x:{ beginAtZero:true } } }
  });
}
