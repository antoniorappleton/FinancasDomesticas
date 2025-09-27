// src/screens/settings.js
export async function init({ sb, outlet } = {}) {
  sb = sb || window.sb;
  outlet = outlet || document.getElementById("outlet");

  // ---------- util ----------
  const $ = (sel) => outlet.querySelector(sel);
  const money = (n) => "€ " + Number(n||0).toLocaleString("pt-PT",{minimumFractionDigits:2,maximumFractionDigits:2});
  const todayYYYYMM = () => { const d=new Date(); return d.toISOString().slice(0,7); };

  // ---------- Chart.js + datalabels ----------
  async function ensureCharts() {
    if (!window.Chart) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
    }
    if (!window.ChartDataLabels) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2";
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
      Chart.register(ChartDataLabels);
    }
  }

  // ---------- IMPORT CSV (tua versão, resumida – mantém os IDs/fluxo) ----------
  const fileEl    = $("#imp-file");
  const btnParse  = $("#imp-parse");
  const btnImport = $("#imp-import");
  const preview   = $("#imp-preview");
  const progress  = $("#imp-progress");
  const infoEl    = $("#imp-info");
  const logEl     = $("#imp-log");
  const log = (m)=>{ if(logEl){ logEl.textContent += (logEl.textContent ? "\n":"") + m; } console.log("[import]",m); };
  const info= (m)=>{ if(infoEl) infoEl.textContent = m||""; };

  // helpers CSV iguais aos teus…
  const normalizeHeader = (h) => String(h||"").replace(/^\uFEFF/,"").trim().toLowerCase()
    .replace(/\s+/g,' ').replace(/[ãâáàä]/g,'a').replace(/[êéèë]/g,'e')
    .replace(/[îíìï]/g,'i').replace(/[õôóòö]/g,'o').replace(/[ûúùü]/g,'u').replace(/ç/g,'c');

  const normalize = (v) => {
    if (v == null) return "";
    let t = String(v).trim();
    if (/^(null|nil|na|—|-|)$/i.test(t)) return "";
    return t.replace(/^"(.*)"$/,'$1').replace(/""/g,'"');
  };

  const detectDelimiter = (text) => {
    const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
    const cand = [",",";","\t","|"];
    const scores = cand.map(d => (sample.match(new RegExp(`\\${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`,"g"))||[]).length);
    return cand[scores.indexOf(Math.max(...scores))] || ",";
  };
  const splitCSVLine = (line, d) => line.split(new RegExp(`${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`)).map(s => s.replace(/^"(.*)"$/,'$1').replace(/""/g,'"'));
  const parseAmount = (s) => {
    s = normalize(s); if (!s) return NaN;
    let t = s.replace(/[€\s]/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',', '.');
    const v = Number(t); return isFinite(v) ? v : NaN;
  };
  const toISO = (s) => {
    s = normalize(s); if(!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0,10);
  };

  // dicionários
  const [
    { data: types },
    { data: regs },
    { data: pms },
    { data: sts },
    { data: accounts },
    { data: cats }
  ] = await Promise.all([
    sb.from("transaction_types").select("id,code,name_pt"),
    sb.from("regularities").select("id,code,name_pt"),
    sb.from("payment_methods").select("id,code,name_pt"),
    sb.from("statuses").select("id,code,name_pt"),
    sb.from("accounts").select("id,name").order("name"),
    sb.from("categories").select("id,name,parent_id")
  ]);

  const TYPE_BY_LABEL = new Map(); (types||[]).forEach(t => { TYPE_BY_LABEL.set(normalizeHeader(t.code),t.id); TYPE_BY_LABEL.set(normalizeHeader(t.name_pt),t.id); });
  const STATUS_BY_LABEL = new Map(); (sts||[]).forEach(s => { STATUS_BY_LABEL.set(normalizeHeader(s.code),s.id); STATUS_BY_LABEL.set(normalizeHeader(s.name_pt),s.id); });
  const PM_BY_LABEL = new Map(); (pms||[]).forEach(p => { PM_BY_LABEL.set(normalizeHeader(p.code),p.id); PM_BY_LABEL.set(normalizeHeader(p.name_pt),p.id); });
  const REG_BY_LABEL = new Map(); (regs||[]).forEach(r => { REG_BY_LABEL.set(normalizeHeader(r.code),r.id); REG_BY_LABEL.set(normalizeHeader(r.name_pt),r.id); });
  const ACC_BY_NAME = new Map((accounts||[]).map(a => [normalizeHeader(a.name), a.id]));
  const catById = new Map((cats||[]).map(c=>[c.id,c]));
  const CAT_BY_PATH = new Map();
  (cats||[]).forEach(c=>{
    if (c.parent_id) {
      const p = catById.get(c.parent_id);
      if (p) CAT_BY_PATH.set(normalizeHeader(`${p.name} > ${c.name}`), c.id);
    }
    CAT_BY_PATH.set(normalizeHeader(c.name), c.id);
  });

  const ALIASES = {
    date:["date","data"], amount:["amount","valor","montante","value"],
    type:["type","tipo","type_code","tipo_code"],
    account:["account","conta","account_name"],
    category:["category","categoria","category_path","categoria_path"],
    description:["description","descricao","descrição","desc"],
    payment_method:["payment_method","metodo","método","payment_method_code"],
    status:["status","estado","status_code"],
    regularity:["regularity","regularidade","regularity_code"],
    notes:["notes","notas"], location:["location","local","localizacao"],
    currency:["currency","moeda"], expense_nature:["expense_nature","fixa_variavel"]
  };
  const pick = (row,key)=>{ const keys=ALIASES[key]||[key]; for(const k of keys){const v=normalize(row[normalizeHeader(k)]); if(v) return v;} return ""; };

  let mappedRows = [];

  btnParse?.addEventListener("click", async () => {
    logEl.textContent=""; info("");
    mappedRows=[]; btnImport.disabled=true; preview.innerHTML=""; progress.hidden=true;

    const file = fileEl?.files?.[0];
    if(!file){ info("Escolhe um ficheiro .csv"); return; }
    const raw = await file.text();
    const text = raw.replace(/^\uFEFF/,"");
    const delim = detectDelimiter(text);
    const lines = text.split(/\r?\n/).filter(l=>l.trim().length>0);
    if (lines.length<2){ info("CSV sem linhas suficientes."); return; }

    const head = splitCSVLine(lines[0],delim).map(normalizeHeader);
    log(`Delimitador detetado: "${delim === "\t" ? "\\t" : delim}" | Cabeçalhos: ${head.join(" | ")}`);

    const rows = [];
    for (let i=1;i<lines.length;i++){
      const cols = splitCSVLine(lines[i],delim);
      const o={}; head.forEach((hn,idx)=>o[hn]=cols[idx]??""); rows.push(o);
    }

    const userId = (await sb.auth.getUser()).data?.user?.id || null;
    const errors=[]; const out=[];

    for(let i=0;i<rows.length;i++){
      const r=rows[i];
      const dateISO = toISO(pick(r,"date"));
      if(!dateISO){ errors.push(`L${i+2}: data inválida "${pick(r,"date")}"`); continue; }

      let amountNum = parseAmount(pick(r,"amount"));
      if(isNaN(amountNum)){ errors.push(`L${i+2}: valor inválido "${pick(r,"amount")}"`); continue; }
      const sign = amountNum<0?-1:1; amountNum=Math.abs(amountNum);

      const accName = pick(r,"account");
      const accountId = ACC_BY_NAME.get(normalizeHeader(accName));
      if(!accountId){ errors.push(`L${i+2}: conta não encontrada "${accName}"`); continue; }

      const typeLabel = pick(r,"type");
      let typeId = TYPE_BY_LABEL.get(normalizeHeader(typeLabel)) || null;

      const catRaw = pick(r,"category");
      let categoryId = null; if (catRaw) categoryId = CAT_BY_PATH.get(normalizeHeader(catRaw)) || null;

      if(!typeId){
        if (/poupan/.test(normalizeHeader(catRaw))) typeId = TYPE_BY_LABEL.get("savings");
        else if (sign<0) typeId = TYPE_BY_LABEL.get("expense");
        else typeId = TYPE_BY_LABEL.get("income");
      }

      const statusId        = STATUS_BY_LABEL.get(normalizeHeader(pick(r,"status"))) || STATUS_BY_LABEL.get("done") || null;
      const paymentMethodId = PM_BY_LABEL.get(normalizeHeader(pick(r,"payment_method"))) || null;
      const regularityId    = REG_BY_LABEL.get(normalizeHeader(pick(r,"regularity"))) || null;

      out.push({
        user_id:userId,type_id:typeId,regularity_id:regularityId,account_id:accountId,category_id:categoryId,
        payment_method_id:paymentMethodId,status_id:statusId,
        date:dateISO, amount:amountNum,
        description: pick(r,"description")||null, location: pick(r,"location")||null, notes: pick(r,"notes")||null,
        currency: pick(r,"currency")||"EUR"
      });
    }

    // dedupe seguro (evita duplicados de copy/paste)
    const dedupe = new Map();
    for (const p of out) {
      const key = [p.date, Number(p.amount).toFixed(2), p.type_id, p.account_id, p.category_id||"_", (p.description||"").trim()].join("|");
      if (!dedupe.has(key)) dedupe.set(key, p);
    }
    const before = out.length; mappedRows = [...dedupe.values()];
    if (before !== mappedRows.length) log(`⚠️ Deduplicadas ${before - mappedRows.length} linhas iguais no CSV.`);

    // preview
    const headRow = ["Data","Valor","Tipo/Conta","Categoria","Descrição"];
    const html = [
      `<table style="width:100%;font-size:.9rem;border-collapse:collapse">`,
      `<thead><tr>${headRow.map(h=>`<th style="text-align:left;border-bottom:1px solid #eee;padding:6px">${h}</th>`).join("")}</tr></thead>`,
      `<tbody>`,
      ...mappedRows.slice(0,10).map(p=>{
        const tName = (types||[]).find(x=>x.id===p.type_id)?.name_pt || (types||[]).find(x=>x.id===p.type_id)?.code || "";
        const acc = (accounts||[]).find(a=>a.id===p.account_id)?.name || "";
        const cat = p.category_id ? (catById.get(p.category_id)?.name) : "(sem)";
        return `<tr>
          <td style="padding:6px;border-bottom:1px solid #f3f3f3">${p.date}</td>
          <td style="padding:6px;border-bottom:1px solid #f3f3f3">€ ${p.amount.toFixed(2)}</td>
          <td style="padding:6px;border-bottom:1px solid #f3f3f3">${tName} / ${acc}</td>
          <td style="padding:6px;border-bottom:1px solid #f3f3f3">${cat}</td>
          <td style="padding:6px;border-bottom:1px solid #f3f3f3">${p.description||""}</td>
        </tr>`;
      }),
      `</tbody></table>`
    ].join("");
    preview.innerHTML = html;

    info(`Registos válidos: ${mappedRows.length} / ${rows.length}.`);
    if (errors.length) log("Avisos:\n- " + errors.slice(0,10).join("\n- ") + (errors.length>10?`\n(+${errors.length-10} mais…)`:""));
    btnImport.disabled = mappedRows.length === 0;
  });

  btnImport?.addEventListener("click", async ()=>{
    if(!mappedRows.length){ info("Nada para importar. Faz primeiro a pré-visualização."); return; }
    progress.hidden=false; progress.value=0; btnImport.disabled=true; btnParse.disabled=true; fileEl.disabled=true; logEl.textContent=""; info("A importar…");
    try{
      const CHUNK=200;
      for(let i=0;i<mappedRows.length;i+=CHUNK){
        const batch = mappedRows.slice(i,i+CHUNK);
        const { error } = await sb.from("transactions").insert(batch);
        if (error) throw error;
        progress.value = Math.round(((i+batch.length)/mappedRows.length)*100);
      }
      info(`✅ Importação concluída: ${mappedRows.length} registos inseridos.`);
    }catch(e){
      info("❌ Falha na importação."); log(e?.message||String(e));
    }finally{
      btnImport.disabled=false; btnParse.disabled=false; fileEl.disabled=false; setTimeout(()=>progress.hidden=true,1200);
    }
  });

  // ---------- RELATÓRIO (modal + PDF) ----------
  const ov   = $("#report-overlay");
  const open = $("#btn-report-open");
  const closeBtn = $("#rpt-close");
  const scopeSel = $("#rpt-scope");
  const monthInp = $("#rpt-month");
  const btnPrev  = $("#rpt-preview");
  const btnPDF   = $("#rpt-pdf");

  // default mês corrente
  if (monthInp) monthInp.value = todayYYYYMM();

  let charts = [];
  const addChart = (c)=>charts.push(c);
  const destroyCharts = ()=>{ charts.forEach(c=>{try{c.destroy()}catch{}}); charts=[]; };

  function openModal(){ ov?.classList.remove("hidden"); ov?.setAttribute("aria-hidden","false"); }
  function closeModal(){ destroyCharts(); ov?.classList.add("hidden"); ov?.setAttribute("aria-hidden","true"); }

  open?.addEventListener("click", async ()=>{ openModal(); await renderReport(); });
  closeBtn?.addEventListener("click", closeModal);
  btnPrev?.addEventListener("click", async ()=>{ destroyCharts(); await renderReport(); });

  async function renderReport(){
    await ensureCharts();
    const scope = scopeSel?.value || "month";
    const month = monthInp?.value || todayYYYYMM();
    const [yr, mo] = month.split("-").map(Number);

    // intervalos
    const from = scope==="month" ? `${yr}-${String(mo).padStart(2,"0")}-01` : `${yr}-01-01`;
    const to   = scope==="month" ? new Date(yr,mo,1).toISOString().slice(0,10) : `${yr+1}-01-01`;

    // KPIs (v_monthly_summary para ano, ou agregação do mês)
    let income=0, expense=0, savings=0, net=0;

    if (scope==="month"){
      const { data, error } = await sb.from("v_monthly_summary").select("*").gte("month",from).lt("month",to);
      if(!error && data?.[0]) {
        income = Number(data[0].income||0);
        expense= Number(data[0].expense||0);
        savings= Number(data[0].savings||0);
        net    = Number(data[0].net||0);
      }
    } else {
      const { data, error } = await sb.from("v_monthly_summary").select("*").gte("month",from).lt("month",to);
      if(!error && data?.length){
        data.forEach(r=>{ income+=Number(r.income||0); expense+=Number(r.expense||0); savings+=Number(r.savings||0); net+=Number(r.net||0); });
      }
    }

    $("#rpt-kpi-income").textContent  = money(income);
    $("#rpt-kpi-expense").textContent = money(Math.abs(expense));
    $("#rpt-kpi-savings").textContent = money(Math.abs(savings));
    $("#rpt-kpi-balance").textContent = money(net);

    // Distribuição por categorias (apenas despesas, período)
    const { data: catRows } = await sb
      .from("transactions")
      .select("amount, categories(name,parent_id), category_id, type_id, transaction_types(code)")
      .gte("date", from).lt("date", to);

    const expOnly = (catRows||[]).filter(r => r.transaction_types?.code === "EXPENSE");
    const catMap = new Map(); // "Pai > Filho" -> total
    const parents = new Map((cats||[]).map(c=>[c.id,c]));
    const catPath = (row) => {
      const c = row.categories;
      if (!c) return "(Sem categoria)";
      if (!c.parent_id) return c.name;
      const p = parents.get(c.parent_id);
      return (p?.name ? p.name+" > " : "") + c.name;
    };
    expOnly.forEach(r=>{
      const key = catPath(r);
      catMap.set(key, (catMap.get(key)||0) + Number(r.amount||0));
    });
    const labels = Array.from(catMap.keys());
    const dataVals = labels.map(k=>catMap.get(k)||0);
    const totalCat = dataVals.reduce((a,b)=>a+b,0);

    // PIE com valores e percentagens no rótulo (plugin datalabels)
    const ctxPie = $("#rpt-cat-pie")?.getContext("2d");
    if (ctxPie){
      addChart(new Chart(ctxPie,{
        type:"pie",
        data:{ labels, datasets:[{ data:dataVals }]},
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{
            legend:{ position:"bottom" },
            datalabels:{
              color:"#0f172a", backgroundColor:"rgba(255,255,255,.85)", borderRadius:4, padding:4,
              formatter:(value)=> `${money(value)} (${ totalCat? (value/totalCat*100).toFixed(1) : 0 }%)`,
              display:(ctx)=> {
                const v = ctx.dataset.data[ctx.dataIndex]||0;
                return totalCat ? (v/totalCat)>=0.05 : false; // evita ruído <5%
              }
            }
          }
        }
      }));
    }

    // Fixas vs Variáveis (usa heurística simples: nome de categoria + qualquer coluna expense_nature se existir)
    const FIXED_HINTS = ["renda","utilidades","internet","seguro","créditos","mensalidades","assinaturas","telemóvel","empregada","iuc"];
    const looksFixed = (label) => FIXED_HINTS.some(h=>String(label||"").toLowerCase().includes(h));
    let fixed=0, variable=0;
    expOnly.forEach(r=>{ looksFixed(catPath(r)) ? fixed+=Number(r.amount||0) : variable+=Number(r.amount||0); });

    const ctxDonut = $("#rpt-fixed-donut")?.getContext("2d");
    if (ctxDonut){
      addChart(new Chart(ctxDonut,{
        type:"doughnut",
        data:{ labels:["Fixas","Variáveis"], datasets:[{ data:[fixed,variable] }]},
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{
            legend:{ position:"bottom" },
            datalabels:{
              color:"#0f172a", backgroundColor:"rgba(255,255,255,.85)", borderRadius:4, padding:4,
              formatter:(v)=> money(v),
              display:true
            }
          }
        }
      }));
    }

    // Séries mensais (últimos 12 meses, barras + linha saldo)
    const start12 = new Date(yr, (scope==="month"? mo-1 : 11), 1); start12.setMonth(start12.getMonth()-11);
    const from12  = new Date(start12.getFullYear(), start12.getMonth(), 1).toISOString().slice(0,10);
    const { data: ms } = await sb.from("v_monthly_summary").select("*").gte("month", from12).lte("month", to);
    const byKey = new Map((ms||[]).map(r=>[String(r.month).slice(0,7), r]));
    const keys12 = []; const lbls12=[]; for(let i=0;i<12;i++){ const d=new Date(start12.getFullYear(), start12.getMonth()+i, 1); const k=d.toISOString().slice(0,7); keys12.push(k); lbls12.push(d.toLocaleDateString("pt-PT",{month:"short"})); }
    const arrInc = keys12.map(k=>Number(byKey.get(k)?.income||0));
    const arrExp = keys12.map(k=>Math.abs(Number(byKey.get(k)?.expense||0)));
    const arrSav = keys12.map(k=>Math.abs(Number(byKey.get(k)?.savings||0)));
    const arrNet = keys12.map(k=>Number(byKey.get(k)?.net||0));

    const ctxSeries = $("#rpt-series")?.getContext("2d");
    if (ctxSeries){
      addChart(new Chart(ctxSeries,{
        type:"bar",
        data:{ labels: lbls12, datasets:[
          { type:"bar",  label:"Receitas",  data:arrInc },
          { type:"bar",  label:"Despesas",  data:arrExp },
          { type:"bar",  label:"Poupanças", data:arrSav },
          { type:"line", label:"Saldo",     data:arrNet, tension:.25, borderWidth:2, fill:false }
        ]},
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:"top"} }, scales:{ y:{ beginAtZero:true } } }
      }));
    }
  }

  // ---------- PDF (usa jsPDF + imagens dos canvas com rótulos já desenhados) ----------
  async function ensureJsPDF(){
    if (!window.jspdf) {
      await new Promise((res,rej)=>{
        const s=document.createElement("script");
        s.src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
        s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
    }
  }

  btnPDF?.addEventListener("click", async ()=>{
    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:"pt", format:"a4" });
    let y=56;

    const scope = scopeSel?.value || "month";
    const month = monthInp?.value || todayYYYYMM();
    const title = scope==="month" ? `Relatório — ${month}` : `Relatório Anual — ${month.slice(0,4)}`;

    doc.setFont("helvetica","bold"); doc.setFontSize(16);
    doc.text(title, 56, y); y+=18;

    // KPIs
    const k = [
      { label:"Receitas",  value: $("#rpt-kpi-income")?.textContent || "—" },
      { label:"Despesas",  value: $("#rpt-kpi-expense")?.textContent || "—" },
      { label:"Poupanças", value: $("#rpt-kpi-savings")?.textContent || "—" },
      { label:"Saldo",     value: $("#rpt-kpi-balance")?.textContent || "—" },
    ];
    doc.setFont("helvetica","normal"); doc.setFontSize(11);
    k.forEach((r,i)=>{ doc.text(`${r.label}: ${r.value}`, 56 + i*130, y); });
    y+=22;

    // helper: adiciona um canvas como imagem, largura total com margem
    const addCanvas = (canvasId, caption) => {
      const c = $(canvasId);
      if (!c) return;
      const img = c.toDataURL("image/png", 1.0);
      const maxW = 503;       // 595 - margens (2*46)
      const h = (c.height / c.width) * maxW;
      doc.setFont("helvetica","bold"); doc.setFontSize(12);
      doc.text(caption, 56, y); y+=10;
      doc.addImage(img, "PNG", 56, y, maxW, h, undefined, "FAST"); y += h + 18;
      if (y > 770) { doc.addPage(); y = 56; }
    };

    addCanvas("#rpt-cat-pie", "Distribuição de despesas por categorias");
    addCanvas("#rpt-fixed-donut", "Fixas vs Variáveis");
    addCanvas("#rpt-series", "Séries mensais");

    doc.save(`Relatorio_${month}.pdf`);
  });
}
