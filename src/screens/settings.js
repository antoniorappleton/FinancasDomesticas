// src/screens/settings.js
export async function init({ sb, outlet } = {}) {
  sb ||= window.sb;
  outlet ||= document.getElementById("outlet");

  // ------------ ligação/sessão (preflight) ------------
  async function preflight() {
    if (!navigator.onLine) throw new Error("Sem ligação à internet.");
    const { data: { session }, error: sErr } = await sb.auth.getSession();
    if (sErr) throw sErr;
    if (!session) throw new Error("Sessão expirada — faça login.");
    const { error: pingErr } = await sb
      .from("transaction_types")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (pingErr) throw new Error("Falha de ligação ao Supabase.");
  }
  const getUserId = async () => (await sb.auth.getUser()).data?.user?.id;

  // -------------------- helpers base --------------------
  const $  = (sel) => outlet.querySelector(sel);
  const pad2 = (n) => String(n).padStart(2, "0");
  const money = (n) => "€ " + Number(n || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

  const currentMonthStartISO = () => { const n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth(), 1)); };
  const nextMonthStartISO    = () => { const n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth()+1, 1)); };

  async function ensureChartStack() {
    if (!window.Chart) {
      await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    }
    if (!window.ChartDataLabels) {
      await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      try { Chart.register(ChartDataLabels); } catch {}
    }
  }

  // ======================================================
  //                      IMPORTAÇÃO CSV
  // ======================================================
  const log  = (m) => { const el = $("#imp-log"); if (el) el.textContent += (el.textContent ? "\n" : "") + m; };
  const info = (m, ok=false) => { const el = $("#imp-info"); if (el) { el.textContent = m || ""; el.style.color = ok ? "#16a34a" : ""; } };

  const normalizeHeader = (h) =>
    String(h || "").replace(/^\uFEFF/, "").trim().toLowerCase()
      .replace(/\s+/g, " ").replace(/[ãâáàä]/g, "a").replace(/[êéèë]/g, "e")
      .replace(/[îíìï]/g, "i").replace(/[õôóòö]/g, "o").replace(/[ûúùü]/g, "u").replace(/ç/g, "c");

  const normalize = (v) => {
    if (v == null) return "";
    let t = String(v).trim();
    if (/^(null|nil|na|—|-|)$/.test(t)) return "";
    return t.replace(/^"(.*)"$/, "$1").replace(/""/g, '"');
  };

  const detectDelimiter = (text) => {
    const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
    const cand = [",", ";", "\t", "|"];
    const scores = cand.map((d) => (sample.match(new RegExp(`\\${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`, "g")) || []).length);
    return cand[scores.indexOf(Math.max(...scores))] || ",";
  };

  const splitCSVLine = (line, d) =>
    line.split(new RegExp(`${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`)).map(s => s.replace(/^"(.*)"$/,'$1').replace(/""/g,'"'));

  const normalizeMoney = (s) => {
    if (typeof s === "number") return +s.toFixed(2);
    if (!s) return 0;
    const n = String(s).replace(/[€\s]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    const v = parseFloat(n);
    return isNaN(v) ? 0 : +v.toFixed(2);
  };

  const natureFromTipo = (tipo) => {
    const t = (tipo || "").toLowerCase();
    if (t.startsWith("fix")) return "fixed";
    if (t.startsWith("var")) return "variable";
    return null;
  };

  // Preferir parent "de sistema" se existir; limitar sempre a 1 linha; ao criar, passa user_id
  async function ensureCategoryPath(parentName, childName) {
  try {
    const uid = (await sb.auth.getUser()).data?.user?.id;
    let parentId = null;

    if (parentName) {
      const { data: plist, error: e1 } = await sb
        .from("categories")
        .select("id,created_at")
        .eq("name", parentName)
        .is("parent_id", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (e1) throw e1;

      const p = plist?.[0] || null;
      if (!p) {
        const { data: created, error: e2 } = await sb
          .from("categories")
          .insert({ name: parentName, user_id: uid })
          .select("id")
          .single();
        if (e2) throw e2;
        parentId = created.id;
      } else {
        parentId = p.id;
      }
    }

    const { data: clist, error: e3 } = await sb
      .from("categories")
      .select("id,created_at")
      .eq("name", childName)
      .eq("parent_id", parentId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (e3) throw e3;

    const c = clist?.[0] || null;
    if (!c) {
      const { data: createdChild, error: e4 } = await sb
        .from("categories")
        .insert({ name: childName, parent_id: parentId, user_id: uid })
        .select("id")
        .single();
      if (e4) throw e4;
      return createdChild.id;
    }
    return c.id;
  } catch (err) {
    console.error("ensureCategoryPath failed:", err);
    throw new Error("Falha ao resolver categoria (rede/sessão ou duplicados).");
  }
}


  async function getExpenseTypeId() {
    const { data } = await sb.from("transaction_types").select("id").eq("code", "EXPENSE").single();
    return data.id;
  }
  async function getDefaultAccountId() {
    const uid = await getUserId();
    let { data: acc } = await sb.from("accounts").select("id").eq("name", "Conta Principal").maybeSingle();
    if (!acc) {
      const r = await sb.from("accounts").select("id").limit(1);
      acc = r.data?.[0];
    }
    if (!acc) {
      const { data: created } = await sb
        .from("accounts")
        .insert({ name: "Conta Principal", user_id: uid, currency: "EUR", initial_balance: 0 })
        .select("id")
        .single();
      return created.id;
    }
    return acc.id;
  }

  async function parseCsvFile(file) {
    const text = await file.text();
    const delimiter = detectDelimiter(text);
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    if (lines.length < 2) return [];
    const headers = splitCSVLine(lines[0], delimiter).map(normalizeHeader);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCSVLine(lines[i], delimiter);
      const obj = {};
      headers.forEach((h, idx) => obj[h] = cols[idx]);
      rows.push(obj);
    }
    return rows;
  }

  function renderPreviewTable(rows) {
    const wrap = $("#imp-table-wrap");
    const thead = $("#imp-table thead");
    const tbody = $("#imp-table tbody");
    if (!wrap || !thead || !tbody) return;
    if (!rows.length) { wrap.style.display = "none"; return; }
    const cols = Object.keys(rows[0]);
    thead.innerHTML = `<tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>`;
    tbody.innerHTML = rows.slice(0, 200).map(r => `<tr>${cols.map(c => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("");
    wrap.style.display = "block";
  }

  let previewRows = [];

  $("#imp-clear")?.addEventListener("click", () => {
    previewRows = [];
    $("#imp-table-wrap").style.display = "none";
    $("#imp-log").textContent = "";
    info("");
  });

  $("#imp-preview")?.addEventListener("click", async () => {
    const f = $("#imp-file")?.files?.[0];
    if (!f) return alert("Escolha um ficheiro CSV.");
    $("#imp-log").textContent = ""; info("A analisar CSV…");
    const rows = await parseCsvFile(f);

    // normaliza: Tipo / area / categoria / montante
    previewRows = rows.map((r) => ({
      Tipo: r["tipo"] ?? r["Tipo"] ?? "",
      area: r["area"] ?? r["Area"] ?? "",
      categoria: r["categoria"] ?? r["Categoria"] ?? "",
      montante: r["montante"] ?? r["Montante"] ?? r["valor"] ?? r["Valor"] ?? ""
    }));

    renderPreviewTable(previewRows);
    info(`Pré-visualização: ${previewRows.length} linhas.`);
  });

  $("#imp-import")?.addEventListener("click", async () => {
    try {
      await preflight();
    } catch (e) {
      alert(e.message || "Falha de ligação.");
      return;
    }

    if (!previewRows.length) return alert("Faça a pré-visualização primeiro.");
    const m = $("#imp-month")?.value;
    if (!m) return alert("Indique o mês (YYYY-MM).");

    const [y, mo] = m.split("-").map(Number);
    const startISO = ymd(new Date(y, mo - 1, 1));
    const endISO   = ymd(new Date(y, mo, 1));

    const expenseTypeId = await getExpenseTypeId();
    const accountId     = await getDefaultAccountId();

    if (!confirm(`Substituir dados de ${pad2(mo)}/${y}?`)) return;

    // 1) apaga período
    log(`A eliminar ${startISO}..${endISO}…`);
    await sb.from("transactions").delete().gte("date", startISO).lt("date", endISO);

    // 2) transforma linhas → transações
    const txs = [];
    for (const row of previewRows) {
      const tipo = row.Tipo;
      const area = row.area;
      const cat  = row.categoria;
      const amount = normalizeMoney(row.montante);
      if (!cat && !area) continue; // ignora linhas vazias
      const category_id = await ensureCategoryPath(area || null, cat || (area || "Outros"));
      txs.push({
        type_id: expenseTypeId,
        account_id: accountId,
        category_id,
        date: startISO,                 // regista no 1º dia do mês
        amount_abs: amount,
        currency: "EUR",
        expense_nature: natureFromTipo(tipo),
        description: `${area || ""}${area ? " > " : ""}${cat || ""}`.trim()
      });
    }

    // 3) dedupe e insert em chunks
    const dedupe = new Map();
    for (const t of txs) {
      const key = [t.date, t.amount_abs.toFixed(2), t.type_id, t.account_id, t.category_id || "_", (t.description || "").trim()].join("|");
      if (!dedupe.has(key)) dedupe.set(key, t);
    }
    const finalTxs = [...dedupe.values()];
    if (finalTxs.length !== txs.length) log(`⚠️ Deduplicadas ${txs.length - finalTxs.length} linhas.`);

    log("A importar em lotes…");
    const CHUNK = 200;
    let inserted = 0;
    for (let i = 0; i < finalTxs.length; i += CHUNK) {
      const chunk = finalTxs.slice(i, i + CHUNK);
      const { error } = await sb.from("transactions").insert(chunk);
      if (error) { log("Erro no insert: " + error.message); throw error; }
      inserted += chunk.length;
      info(`Importado: ${inserted}/${finalTxs.length}`);
    }
    log(`Concluído. Inseridos ${inserted}.`);
    info(`✅ Importação concluída: ${inserted} registos.`, true);
    alert("Importação concluída!");
  });

  // ======================================================
  //                         RELATÓRIOS
  // ======================================================
  function toggleReportInputs() {
    const t = $("#rpt-type")?.value || "monthly";
    $("#rpt-month-wrap").classList.toggle("hidden", t !== "monthly");
    $("#rpt-range-wrap").classList.toggle("hidden", t !== "range");
    $("#rpt-range2-wrap").classList.toggle("hidden", t !== "range");
    $("#rpt-year-wrap").classList.toggle("hidden", t !== "yearly");
  }
  $("#rpt-type")?.addEventListener("change", toggleReportInputs);
  toggleReportInputs();

  $("#btn-report-open")?.addEventListener("click", async () => {
    await ensureChartStack();
    $("#report-overlay").classList.remove("hidden");
    await buildReport();
  });

  $("#rpt-close")?.addEventListener("click", () => {
    $("#report-overlay").classList.add("hidden");
    try { _rptCat?.destroy(); } catch {}
    try { _rptFix?.destroy(); } catch {}
    try { _rptSeries?.destroy(); } catch {}
  });

  function computePeriod() {
    const t = $("#rpt-type")?.value || "monthly";
    if (t === "monthly") {
      const m = $("#rpt-month")?.value || new Date().toISOString().slice(0,7);
      const [y, mm] = m.split("-").map(Number);
      return { label: m, from: ymd(new Date(y, mm-1, 1)), to: ymd(new Date(y, mm, 1)) };
    }
    if (t === "range") {
      const a = $("#rpt-from")?.value || new Date().toISOString().slice(0,7);
      const b = $("#rpt-to")?.value   || a;
      const [ya, ma] = a.split("-").map(Number);
      const [yb, mb] = b.split("-").map(Number);
      return { label:`${a} → ${b}`, from: ymd(new Date(ya, ma-1, 1)), to: ymd(new Date(yb, mb, 1)) };
    }
    const y = Number($("#rpt-year")?.value || new Date().getFullYear());
    return { label: String(y), from: ymd(new Date(y, 0, 1)), to: ymd(new Date(y+1, 0, 1)) };
  }

  let _rptCat, _rptFix, _rptSeries, _catLegendPDF = [], _fixLegendPDF = [];

  async function buildReport() {
    const p = computePeriod();
    $("#rpt-title").textContent = `Relatório Financeiro — ${p.label}`;

    const { data: tInc } = await sb.from("transaction_types").select("id").eq("code","INCOME").single();
    const { data: tExp } = await sb.from("transaction_types").select("id").eq("code","EXPENSE").single();
    const { data: tSav } = await sb.from("transaction_types").select("id").eq("code","SAVINGS").single();

    const { data: rows } = await sb.from("transactions")
      .select("date, amount_abs, amount_signed, type_id, expense_nature, categories(name,parent_id)")
      .gte("date", p.from).lt("date", p.to);

    const sum = (arr) => arr.reduce((a,b)=>a+Number(b||0),0);

    const income  = sum(rows.filter(r => r.type_id === tInc.id).map(r=>r.amount_abs));
    const expense = sum(rows.filter(r => r.type_id === tExp.id).map(r=>r.amount_abs));
    const savings = sum(rows.filter(r => r.type_id === tSav.id).map(r=>r.amount_abs));
    const balance = sum(rows.map(r=>r.amount_signed));

    $("#rpt-kpi-income").textContent  = money(income);
    $("#rpt-kpi-expense").textContent = money(expense);
    $("#rpt-kpi-savings").textContent = money(savings);
    $("#rpt-kpi-balance").textContent = money(balance);

    // pizza categorias
    const byCat = new Map();
    rows.filter(r => r.type_id === tExp.id).forEach(r => {
      const name = r.categories?.name || "Sem categoria";
      byCat.set(name, (byCat.get(name)||0) + Number(r.amount_abs||0));
    });
    const labels = [...byCat.keys()];
    const values = labels.map(l => byCat.get(l));
    const total  = values.reduce((a,b)=>a+b,0) || 1;

    try { _rptCat?.destroy(); } catch {}
    _rptCat = new Chart($("#rpt-cat-pie"), {
      type: "pie",
      data: { labels, datasets: [{ data: values }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, datalabels: { formatter: (v)=> (v/total*100).toFixed(1)+"%", anchor:"end", align:"end" } } }
    });
    const colors = _rptCat.data.datasets[0].backgroundColor || [];
    _catLegendPDF = labels.map((lab,i)=>({ label:lab, value:values[i], pct:(values[i]/total)||0, color: colors[i] || "#64748b" }));
    $("#rpt-cat-legend").innerHTML = _catLegendPDF.map(x =>
      `<div class="rpt-legend__item">
         <span class="rpt-legend__dot" style="background:${x.color}"></span>
         <span style="flex:1">${x.label}</span>
         <strong>${money(x.value)}</strong>
         <span style="color:#64748b">&nbsp;(${(x.pct*100).toFixed(1)}%)</span>
       </div>`
    ).join("");

    // donut fixas/variáveis
    const fixed = sum(rows.filter(r => r.type_id === tExp.id && r.expense_nature === "fixed").map(r=>r.amount_abs));
    const variable = sum(rows.filter(r => r.type_id === tExp.id && r.expense_nature !== "fixed").map(r=>r.amount_abs));
    try { _rptFix?.destroy(); } catch {}
    _rptFix = new Chart($("#rpt-fixed-donut"), {
      type: "doughnut",
      data: { labels: ["Fixas", "Variáveis"], datasets: [{ data: [fixed, variable] }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" }, datalabels: { formatter: (v)=>money(v) } } }
    });
    const totFV = (fixed + variable) || 1;
    _fixLegendPDF = [
      { label:"Fixas", value:fixed,     pct: fixed/totFV,     color:"#36a2eb" },
      { label:"Variáveis", value:variable, pct: variable/totFV, color:"#ff6384" },
    ];

    // séries
    const months = {};
    rows.forEach(r => {
      const m = String(r.date).slice(0,7);
      months[m] ||= { inc:0, exp:0, sav:0, net:0 };
      if (r.type_id === tInc.id) months[m].inc += +r.amount_abs;
      if (r.type_id === tExp.id) months[m].exp += +r.amount_abs;
      if (r.type_id === tSav.id) months[m].sav += +r.amount_abs;
      months[m].net += +r.amount_signed;
    });
    const mlabels = Object.keys(months).sort();
    try { _rptSeries?.destroy(); } catch {}
    _rptSeries = new Chart($("#rpt-series"), {
      type: "bar",
      data: { labels: mlabels,
        datasets: [
          { label: "Receitas",  data: mlabels.map(k => months[k].inc) },
          { label: "Despesas",  data: mlabels.map(k => months[k].exp) },
          { label: "Poupanças", data: mlabels.map(k => months[k].sav) },
          { label: "Saldo",     type: "line", data: mlabels.map(k => months[k].net) }
        ] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"top" } }, scales:{ y:{ beginAtZero:true } } }
    });

    // insights
    const effort = income ? ((fixed+variable)/income)*100 : 0;
    const varPct = expense ? (variable/expense)*100 : 0;
    const savPct = income ? (savings/income)*100 : 0;
    $("#rpt-insights").innerHTML = [
      `Taxa de esforço: ${effort.toFixed(1)}%`,
      `Despesas variáveis: ${varPct.toFixed(1)}% das despesas`,
      `Taxa de poupança: ${savPct.toFixed(1)}% das receitas`
    ].map(x=>`<li>${x}</li>`).join("");
  }

  // export PDF
  $("#rpt-export")?.addEventListener("click", async () => {
    await buildReport();
    const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.es.min.js");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 40; let y = M;

    const title = $("#rpt-title")?.textContent || "Relatório Financeiro";
    doc.setFontSize(16); doc.setFont("helvetica","bold"); doc.text(title, M, y); y += 18;
    doc.setDrawColor(230); doc.line(M, y, W-M, y); y += 12;

    const canvasToPage = (id, x, y2, w, h) => { const c = $(id); if (!c) return y2; const img = c.toDataURL("image/png", 1.0); doc.addImage(img, "PNG", x, y2, w, h, undefined, "FAST"); return y2 + h; };
    const drawLegend = (items, x, y2, maxW) => {
      doc.setFont("helvetica","normal"); doc.setFontSize(10);
      const lineH = 14;
      items.forEach(it=>{ doc.setFillColor(it.color || "#888"); doc.circle(x+5, y2+5, 3, "F");
        const txt = `${it.label} — ${money(it.value)} (${(it.pct*100).toFixed(1)}%)`;
        doc.text(txt, x+14, y2+9, { maxWidth: maxW-14 }); y2 += lineH; });
      return y2;
    };

    // KPIs
    const k = [
      ["Receitas",  $("#rpt-kpi-income")?.textContent || "—"],
      ["Despesas",  $("#rpt-kpi-expense")?.textContent || "—"],
      ["Poupanças", $("#rpt-kpi-savings")?.textContent || "—"],
      ["Saldo",     $("#rpt-kpi-balance")?.textContent || "—"],
    ];
    const cellW = (W - 2*M) / 4;
    doc.setFontSize(11); doc.setFont("helvetica","normal");
    k.forEach((kv,i)=>{ const x=M+i*cellW; doc.text(kv[0],x,y); doc.setFont("helvetica","bold"); doc.text(String(kv[1]),x,y+14); doc.setFont("helvetica","normal"); });
    y += 34;

    // duas pizzas lado a lado
    const colW = (W - 2*M - 16)/2, pieH = 220, L = M, R = M + colW + 16;
    doc.setFont("helvetica","bold"); doc.setFontSize(12);
    doc.text("Distribuição por categorias", L, y);
    doc.text("Fixas vs Variáveis", R, y);
    y += 10;

    const y1 = canvasToPage("#rpt-cat-pie", L, y, colW, pieH);
    const y2 = canvasToPage("#rpt-fixed-donut", R, y, colW, pieH);
    y = Math.max(y1, y2) + 8;
    y = Math.max(drawLegend(_catLegendPDF, L, y, colW), drawLegend(_fixLegendPDF, R, y, colW)) + 16;

    if (y > H - 260) { doc.addPage(); y = M; }

    // série mensal
    doc.setFont("helvetica","bold"); doc.setFontSize(12);
    doc.text("Séries mensais", M, y); y += 10;
    y = canvasToPage("#rpt-series", M, y, W-2*M, 240) + 12;

    doc.save("wisebudget-relatorio.pdf");
  });

  // ======================================================
  //                     MANUTENÇÃO DE DADOS
  // ======================================================
  $("#btn-del-month")?.addEventListener("click", async () => {
    try {
      await preflight();
      const start = currentMonthStartISO(), end = nextMonthStartISO();
      if (!confirm(`Eliminar todas as transações de ${start.slice(0,7)}?`)) return;
      await sb.from("transactions").delete().gte("date", start).lt("date", end);
      alert("Mês eliminado.");
    } catch (e) { alert(e.message || "Falha de ligação."); }
  });

  $("#btn-del-range")?.addEventListener("click", async () => {
    try {
      await preflight();
      const startISO = prompt("Início (YYYY-MM-DD):", currentMonthStartISO());
      const endISO   = prompt("Fim EXCLUSIVO (YYYY-MM-DD):", nextMonthStartISO());
      if (!startISO || !endISO) return;
      if (!confirm(`Eliminar transações de ${startISO} até ${endISO} (exclusivo)?`)) return;
      await sb.from("transactions").delete().gte("date", startISO).lt("date", endISO);
      alert("Período eliminado.");
    } catch (e) { alert(e.message || "Falha de ligação."); }
  });

  $("#btn-del-all")?.addEventListener("click", async () => {
    try {
      await preflight();
      if (!confirm("Eliminar TODAS as suas transações?")) return;
      await sb.from("transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      alert("Tudo eliminado.");
    } catch (e) { alert(e.message || "Falha de ligação."); }
  });

  // ======================================================
  //                CATEGORIAS & CONTAS (CRUD)
  // ======================================================
  async function listCategories() {
    const { data } = await sb.from("categories").select("id,name,parent_id").order("parent_id").order("name");
    const parents = (data||[]).filter(c => !c.parent_id);
    const children = (data||[]).filter(c => c.parent_id);
    return parents.map(p => ({ ...p, subs: children.filter(s => s.parent_id === p.id) }));
  }
  async function createCategory(parentId, name) {
    const uid = await getUserId();
    await sb.from("categories").insert({ name, parent_id: parentId || null, user_id: uid });
  }
  async function renameCategory(id, name) { await sb.from("categories").update({ name }).eq("id", id); }
  async function deleteCategory(id) {
    const { count } = await sb.from("transactions").select("*", { count:"exact", head:true }).eq("category_id", id);
    if ((count||0) > 0) return alert("Categoria com movimentos. Mova/apague primeiro.");
    await sb.from("categories").delete().eq("id", id);
  }

  async function renderCategories() {
    const el = $("#list-cats"); if (!el) return;
    const tree = await listCategories();
    el.innerHTML = tree.map(p => `
      <div class="row" style="display:flex;justify-content:space-between;gap:10px;border:1px solid #e5e7eb;border-radius:12px;padding:12px">
        <div>
          <strong>${p.name}</strong>
          ${p.subs.length ? `<div class="row-note">Subcategorias: ${p.subs.map(s=>s.name).join(", ")}</div>` : ""}
        </div>
        <div class="actions" style="gap:6px">
          <button data-edit="${p.id}" class="btn">Renomear</button>
          <button data-newsub="${p.id}" class="btn">Nova Sub</button>
          <button data-del="${p.id}" class="btn">Apagar</button>
        </div>
      </div>
    `).join("");

    el.querySelectorAll("[data-newsub]").forEach(b => b.onclick = async () => { const name = prompt("Nome da subcategoria:"); if (!name) return; await createCategory(b.dataset.newsub, name); renderCategories(); });
    el.querySelectorAll("[data-edit]").forEach(b => b.onclick = async () => { const name = prompt("Novo nome:"); if (!name) return; await renameCategory(b.dataset.edit, name); renderCategories(); });
    el.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { if (!confirm("Apagar categoria?")) return; await deleteCategory(b.dataset.del); renderCategories(); });
  }

  async function listAccounts() {
    const { data } = await sb.from("accounts").select("id,name,currency,initial_balance,archived").order("name");
    return data || [];
  }
  async function createAccount(name, currency="EUR", initial_balance=0) {
    const uid = await getUserId();
    await sb.from("accounts").insert({ name, currency, initial_balance, user_id: uid });
  }
  async function renameAccount(id, name) { await sb.from("accounts").update({ name }).eq("id", id); }
  async function deleteAccount(id) {
    const { count } = await sb.from("transactions").select("*", { count:"exact", head:true }).eq("account_id", id);
    if ((count||0) > 0) return alert("Conta com movimentos. Transfira/apague primeiro.");
    await sb.from("accounts").delete().eq("id", id);
  }

  async function renderAccounts() {
    const el = $("#list-accs"); if (!el) return;
    const accs = await listAccounts();
    el.innerHTML = accs.map(a => `
      <div class="row" style="display:flex;justify-content:space-between;gap:10px;border:1px solid #e5e7eb;border-radius:12px;padding:12px">
        <div>
          <strong>${a.name}</strong>
          <div class="row-note">Moeda: ${a.currency} • Saldo inicial: ${money(+a.initial_balance)}</div>
        </div>
        <div class="actions" style="gap:6px">
          <button data-edit="${a.id}" class="btn">Renomear</button>
          <button data-del="${a.id}" class="btn">Apagar</button>
        </div>
      </div>
    `).join("");

    el.querySelectorAll("[data-edit]").forEach(b => b.onclick = async () => { const name = prompt("Novo nome da conta:"); if (!name) return; await renameAccount(b.dataset.edit, name); renderAccounts(); });
    el.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { if (!confirm("Apagar conta?")) return; await deleteAccount(b.dataset.del); renderAccounts(); });
  }

  $("#btn-new-cat")?.addEventListener("click", async () => {
    const parent = prompt("Área (vazio para categoria raiz):", "");
    const name   = prompt("Nome da categoria:", "");
    if (!name) return;
    let parentId = null;
    if (parent) {
      const { data: p } = await sb.from("categories").select("id").eq("name", parent).is("parent_id", null).order("is_system",{ascending:false}).limit(1).maybeSingle();
      parentId = p?.id ?? null;
      if (!parentId) {
        const uid = await getUserId();
        const { data: c } = await sb.from("categories").insert({ name: parent, user_id: uid }).select("id").single();
        parentId = c.id;
      }
    }
    await createCategory(parentId, name); renderCategories();
  });

  $("#btn-new-acc")?.addEventListener("click", async () => {
    const name = prompt("Nome da conta:", "Conta Secundária");
    if (!name) return;
    await createAccount(name); renderAccounts();
  });

  // arrancar listas
  renderCategories();
  renderAccounts();
}
