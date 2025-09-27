// src/screens/settings.js
export async function init({ sb, outlet } = {}) {
  sb = sb || window.sb;
  outlet = outlet || document.getElementById("outlet");

  // ------------------ helpers simples ------------------
  const $ = (sel) => outlet.querySelector(sel);
  const todayYYYYMM = () => new Date().toISOString().slice(0, 7);

  // ------------------ Chart.js + datalabels ------------------
  async function ensureCharts() {
    // Chart.js
    if (!window.Chart) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src =
          "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    // chartjs-plugin-datalabels
    if (!window.ChartDataLabels) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2";
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    if (window.Chart && window.ChartDataLabels) {
      // regista 1x
      try {
        Chart.register(ChartDataLabels);
      } catch {}
    }
  }

  // =====================================================================
  //                              IMPORTAR CSV
  // =====================================================================
  const fileEl = $("#imp-file");
  const btnParse = $("#imp-parse");
  const btnImport = $("#imp-import");
  const preview = $("#imp-preview");
  const progress = $("#imp-progress");
  const infoEl = $("#imp-info");
  const logEl = $("#imp-log");

  const log = (m) => {
    if (logEl) {
      logEl.textContent += (logEl.textContent ? "\n" : "") + m;
    }
    console.log("[import]", m);
  };
  const info = (m) => {
    if (infoEl) infoEl.textContent = m || "";
  };

  // ——— normalização & parsing
  const normalizeHeader = (h) =>
    String(h || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[ãâáàä]/g, "a")
      .replace(/[êéèë]/g, "e")
      .replace(/[îíìï]/g, "i")
      .replace(/[õôóòö]/g, "o")
      .replace(/[ûúùü]/g, "u")
      .replace(/ç/g, "c");

  const normalize = (v) => {
    if (v == null) return "";
    let t = String(v).trim();
    if (/^(null|nil|na|—|-|)$/i.test(t)) return "";
    // tira aspas exteriores + dobra de aspas
    return t.replace(/^"(.*)"$/, "$1").replace(/""/g, '"');
  };

  const detectDelimiter = (text) => {
    const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
    const cand = [",", ";", "\t", "|"];
    const scores = cand.map(
      (d) =>
        sample.match(new RegExp(`\\${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`, "g"))
          ?.length || 0
    );
    return cand[scores.indexOf(Math.max(...scores))] || ",";
  };

  const splitCSVLine = (line, d) =>
    line
      .split(new RegExp(`${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`))
      .map((s) => s.replace(/^"(.*)"$/, "$1").replace(/""/g, '"'));

  const parseAmount = (s) => {
    s = normalize(s);
    if (!s) return NaN;
    let t = s.replace(/[€\s]/g, "");
    // remove milhar . e vírgula decimal
    t = t.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    const v = Number(t);
    return isFinite(v) ? v : NaN;
  };

  const toISO = (s) => {
    s = normalize(s);
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // DD/MM/YYYY
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  };

  // ——— dicionários
  const [
    { data: types },
    { data: regs },
    { data: pms },
    { data: sts },
    { data: accounts },
    { data: cats },
  ] = await Promise.all([
    sb.from("transaction_types").select("id,code,name_pt"),
    sb.from("regularities").select("id,code,name_pt"),
    sb.from("payment_methods").select("id,code,name_pt"),
    sb.from("statuses").select("id,code,name_pt"),
    sb.from("accounts").select("id,name").order("name"),
    sb.from("categories").select("id,name,parent_id"),
  ]);

  const TYPE_BY_LABEL = new Map();
  (types || []).forEach((t) => {
    TYPE_BY_LABEL.set(normalizeHeader(t.code), t.id);
    TYPE_BY_LABEL.set(normalizeHeader(t.name_pt), t.id);
  });
  const STATUS_BY_LABEL = new Map();
  (sts || []).forEach((s) => {
    STATUS_BY_LABEL.set(normalizeHeader(s.code), s.id);
    STATUS_BY_LABEL.set(normalizeHeader(s.name_pt), s.id);
  });
  const PM_BY_LABEL = new Map();
  (pms || []).forEach((p) => {
    PM_BY_LABEL.set(normalizeHeader(p.code), p.id);
    PM_BY_LABEL.set(normalizeHeader(p.name_pt), p.id);
  });
  const REG_BY_LABEL = new Map();
  (regs || []).forEach((r) => {
    REG_BY_LABEL.set(normalizeHeader(r.code), r.id);
    REG_BY_LABEL.set(normalizeHeader(r.name_pt), r.id);
  });

  const ACC_BY_NAME = new Map(
    (accounts || []).map((a) => [normalizeHeader(a.name), a.id])
  );

  const catById = new Map((cats || []).map((c) => [c.id, c]));
  const CAT_BY_PATH = new Map();
  (cats || []).forEach((c) => {
    if (c.parent_id) {
      const p = catById.get(c.parent_id);
      if (p) CAT_BY_PATH.set(normalizeHeader(`${p.name} > ${c.name}`), c.id);
    }
    // também aceita nome simples
    CAT_BY_PATH.set(normalizeHeader(c.name), c.id);
  });

  const ALIASES = {
    date: ["date", "data"],
    amount: ["amount", "valor", "montante", "value"],
    type: ["type", "tipo", "type_code", "tipo_code"],
    account: ["account", "conta", "account_name"],
    category: ["category", "categoria", "category_path", "categoria_path"],
    description: ["description", "descricao", "descrição", "desc"],
    payment_method: ["payment_method", "metodo", "método", "payment_method_code"],
    status: ["status", "estado", "status_code"],
    regularity: ["regularity", "regularidade", "regularity_code"],
    notes: ["notes", "notas"],
    location: ["location", "local", "localizacao"],
    currency: ["currency", "moeda"],
    expense_nature: ["expense_nature", "fixa_variavel"],
  };
  const pick = (row, key) => {
    const keys = ALIASES[key] || [key];
    for (const k of keys) {
      const v = normalize(row[normalizeHeader(k)]);
      if (v) return v;
    }
    return "";
  };

  // ——— estado de import
  let mappedRows = [];

  // ——— PREVIEW
  btnParse?.addEventListener("click", async () => {
    if (!fileEl || !preview || !btnImport) return;

    logEl && (logEl.textContent = "");
    info("");
    mappedRows = [];
    btnImport.disabled = true;
    preview.innerHTML = "";
    progress && (progress.hidden = true);

    const file = fileEl.files?.[0];
    if (!file) {
      info("Escolhe um ficheiro .csv");
      return;
    }

    const raw = await file.text();
    const text = raw.replace(/^\uFEFF/, "");
    const delim = detectDelimiter(text);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      info("CSV sem linhas suficientes.");
      return;
    }

    const head = splitCSVLine(lines[0], delim).map(normalizeHeader);
    log(
      `Delimitador detetado: "${
        delim === "\t" ? "\\t" : delim
      }" | Cabeçalhos: ${head.join(" | ")}`
    );

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCSVLine(lines[i], delim);
      const o = {};
      head.forEach((hn, idx) => (o[hn] = cols[idx] ?? ""));
      rows.push(o);
    }

    const userId = (await sb.auth.getUser()).data?.user?.id || null;
    const errors = [];
    const out = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      // data
      const dateISO = toISO(pick(r, "date"));
      if (!dateISO) {
        errors.push(`L${i + 2}: data inválida "${pick(r, "date")}"`);
        continue;
      }

      // valor (guarda sinal para inferência; guarda ABS p/ trigger)
      let amountNum = parseAmount(pick(r, "amount"));
      if (isNaN(amountNum)) {
        errors.push(`L${i + 2}: valor inválido "${pick(r, "amount")}"`);
        continue;
      }
      const sign = amountNum < 0 ? -1 : 1;
      amountNum = Math.abs(amountNum);

      // conta
      const accName = pick(r, "account");
      const accountId = ACC_BY_NAME.get(normalizeHeader(accName));
      if (!accountId) {
        errors.push(`L${i + 2}: conta não encontrada "${accName}"`);
        continue;
      }

      // tipo (direto ou inferido)
      const typeLabel = pick(r, "type");
      let typeId = TYPE_BY_LABEL.get(normalizeHeader(typeLabel)) || null;

      const catRaw = pick(r, "category");
      let categoryId = null;
      if (catRaw) categoryId = CAT_BY_PATH.get(normalizeHeader(catRaw)) || null;

      if (!typeId) {
        if (/poupan/.test(normalizeHeader(catRaw))) {
          typeId = TYPE_BY_LABEL.get("savings");
        } else if (sign < 0) {
          typeId = TYPE_BY_LABEL.get("expense");
        } else {
          typeId = TYPE_BY_LABEL.get("income");
        }
      }

      const statusId =
        STATUS_BY_LABEL.get(normalizeHeader(pick(r, "status"))) ||
        STATUS_BY_LABEL.get("done") ||
        null;
      const paymentMethodId =
        PM_BY_LABEL.get(normalizeHeader(pick(r, "payment_method"))) || null;
      const regularityId =
        REG_BY_LABEL.get(normalizeHeader(pick(r, "regularity"))) || null;

      out.push({
        user_id: userId,
        type_id: typeId,
        regularity_id: regularityId,
        account_id: accountId,
        category_id: categoryId,
        payment_method_id: paymentMethodId,
        status_id: statusId,
        date: dateISO,
        amount: amountNum, // trigger define sinal via type_id
        description: pick(r, "description") || null,
        location: pick(r, "location") || null,
        notes: pick(r, "notes") || null,
        currency: pick(r, "currency") || "EUR",
      });
    }

    // dedupe seguro
    const dedupe = new Map();
    for (const p of out) {
      const key = [
        p.date,
        Number(p.amount).toFixed(2),
        p.type_id,
        p.account_id,
        p.category_id || "_",
        (p.description || "").trim(),
      ].join("|");
      if (!dedupe.has(key)) dedupe.set(key, p);
    }
    const before = out.length;
    mappedRows = [...dedupe.values()];
    if (before !== mappedRows.length)
      log(`⚠️ Deduplicadas ${before - mappedRows.length} linhas iguais no CSV.`);

    // preview (até 10 linhas)
    const headRow = ["Data", "Valor", "Tipo/Conta", "Categoria", "Descrição"];
    const html = [
      `<table style="width:100%;font-size:.9rem;border-collapse:collapse">`,
      `<thead><tr>${headRow
        .map(
          (h) =>
            `<th style="text-align:left;border-bottom:1px solid #eee;padding:6px">${h}</th>`
        )
        .join("")}</tr></thead>`,
      `<tbody>`,
      ...mappedRows.slice(0, 10).map((p) => {
        const tName =
          (types || []).find((x) => x.id === p.type_id)?.name_pt ||
          (types || []).find((x) => x.id === p.type_id)?.code ||
          "";
        const acc = (accounts || []).find((a) => a.id === p.account_id)?.name || "";
        const cat = p.category_id ? catById.get(p.category_id)?.name : "(sem)";
        return `<tr>
          <td style="padding:6px;border-bottom:1px solid #f3f3f3">${p.date}</td>
          <td style="padding:6px;border-bottom:1px solid #f3f3f3">€ ${p.amount.toFixed(
            2
          )}</td>
          <td style="padding:6px;border-bottom:1px solid #f3f3f3">${tName} / ${acc}</td>
          <td style="padding:6px;border-bottom:1px solid #f3f3f3">${cat}</td>
          <td style="padding:6px;border-bottom:1px solid #f3f3f3">${
            p.description || ""
          }</td>
        </tr>`;
      }),
      `</tbody></table>`,
    ].join("");
    preview.innerHTML = html;

    info(`Registos válidos: ${mappedRows.length} / ${rows.length}.`);
    if (errors.length)
      log(
        "Avisos:\n- " +
          errors.slice(0, 10).join("\n- ") +
          (errors.length > 10 ? `\n(+${errors.length - 10} mais…)` : "")
      );
    btnImport.disabled = mappedRows.length === 0;
  });

  // ——— IMPORT
  btnImport?.addEventListener("click", async () => {
    if (!mappedRows.length) {
      info("Nada para importar. Faz primeiro a pré-visualização.");
      return;
    }
    progress && (progress.hidden = false);
    if (progress) progress.value = 0;
    btnImport.disabled = true;
    btnParse && (btnParse.disabled = true);
    fileEl && (fileEl.disabled = true);
    logEl && (logEl.textContent = "");
    info("A importar…");

    try {
      const CHUNK = 200;
      for (let i = 0; i < mappedRows.length; i += CHUNK) {
        const batch = mappedRows.slice(i, i + CHUNK);
        const { error } = await sb.from("transactions").insert(batch);
        if (error) throw error;
        if (progress)
          progress.value = Math.round(
            ((i + batch.length) / mappedRows.length) * 100
          );
      }
      info(`✅ Importação concluída: ${mappedRows.length} registos inseridos.`);
    } catch (e) {
      info("❌ Falha na importação.");
      log(e?.message || String(e));
    } finally {
      btnImport.disabled = false;
      btnParse && (btnParse.disabled = false);
      fileEl && (fileEl.disabled = false);
      setTimeout(() => progress && (progress.hidden = true), 1200);
    }
  });

  // =====================================================================
  //                               RELATÓRIOS
  // =====================================================================
  // (assume que o teu settings.html tem a secção de relatórios + modal conforme partilhaste)

  // ====== RELATÓRIOS: UI ======
const S = {
  scopeGroup: outlet.querySelector("#rpt-scope-group"),
  monthMode:  outlet.querySelector("#rpt-month-mode"),
  monthSingleWrap: outlet.querySelector("#rpt-month-single-wrap"),
  monthInput: outlet.querySelector("#rpt-month"),
  fromWrap:   outlet.querySelector("#rpt-from-wrap"),
  toWrap:     outlet.querySelector("#rpt-to-wrap"),
  fromInput:  outlet.querySelector("#rpt-from"),
  toInput:    outlet.querySelector("#rpt-to"),
  yearWrap:   outlet.querySelector("#rpt-year-wrap"),
  yearInput:  outlet.querySelector("#rpt-year"),

  openBtn:    outlet.querySelector("#btn-report-open"),
  overlay:    outlet.querySelector("#report-overlay"),
  closeBtn:   outlet.querySelector("#rpt-close"),
  previewBtn: outlet.querySelector("#rpt-preview"),
  pdfBtn:     outlet.querySelector("#rpt-pdf"),

  kIncome: outlet.querySelector("#rpt-kpi-income"),
  kExpense:outlet.querySelector("#rpt-kpi-expense"),
  kSavings:outlet.querySelector("#rpt-kpi-savings"),
  kBalance:outlet.querySelector("#rpt-kpi-balance"),

  ctxCat: outlet.querySelector("#rpt-cat-pie")?.getContext("2d"),
  ctxFix: outlet.querySelector("#rpt-fixed-donut")?.getContext("2d"),
  ctxSer: outlet.querySelector("#rpt-series")?.getContext("2d"),

  catLegend: outlet.querySelector("#rpt-cat-legend"),
  insights:  outlet.querySelector("#rpt-insights"),
  table:     outlet.querySelector("#rpt-table"),
};

const now = new Date();
const pad2 = n => String(n).padStart(2,"0");
const yyyyMM = (d)=> `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
S.monthInput.value = yyyyMM(now);
S.fromInput.value  = yyyyMM(now);
S.toInput.value    = yyyyMM(now);
S.yearInput.value  = String(now.getFullYear());

// active-pill styling
S.scopeGroup?.addEventListener("click", (e)=>{
  const lab = e.target.closest(".segmented__item"); if(!lab) return;
  S.scopeGroup.querySelectorAll(".segmented__item").forEach(x=>x.classList.remove("is-active"));
  lab.classList.add("is-active");
  lab.querySelector('input[type="radio"]').checked = true;
  updatePeriodControls();
});
S.monthMode?.addEventListener("change", updatePeriodControls);

function currentScope(){
  const checked = S.scopeGroup.querySelector('input[name="rpt-scope"]:checked');
  return checked?.value || "month";
}

function updatePeriodControls(){
  const scope = currentScope();
  const isMonth = scope === "month";
  // mostrar/esconder campos conforme modo
  S.yearWrap.classList.toggle("hidden", isMonth);
  S.monthMode.parentElement.classList.toggle("hidden", !isMonth);
  const range = isMonth && S.monthMode.value === "range";
  S.monthSingleWrap.classList.toggle("hidden", !isMonth || range);
  S.fromWrap.classList.toggle("hidden", !range);
  S.toWrap.classList.toggle("hidden", !range);
}
updatePeriodControls();

// ====== RELATÓRIOS: dados + charts ======
let rptCharts = [];
const destroyRptCharts = () => { rptCharts.forEach(c=>{try{c.destroy()}catch{}}); rptCharts=[]; };

async function ensureChartStack(){
  if (!window.Chart) {
    await new Promise((res,rej)=>{ const s=document.createElement("script");
      s.src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
      s.onload=res; s.onerror=rej; document.head.appendChild(s); });
  }
  if (!window.ChartDataLabels) {
    await new Promise((res,rej)=>{ const s=document.createElement("script");
      s.src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2";
      s.onload=res; s.onerror=rej; document.head.appendChild(s); });
    Chart.register(ChartDataLabels);
  }
}

function toDateISOFirst(ym){ // 'YYYY-MM' -> 'YYYY-MM-01'
  return `${ym}-01`;
}
function addMonth(ym){ const y=+ym.slice(0,4), m=+ym.slice(5,7); return new Date(y,m,1).toISOString().slice(0,10); }

function computePeriod() {
  const scope = currentScope();
  if (scope === "year") {
    const y = Number(S.yearInput.value || now.getFullYear());
    return { kind:"year", from: `${y}-01-01`, to: `${y+1}-01-01`, label: String(y)};
  }
  if (S.monthMode.value === "range") {
    const a = S.fromInput.value || yyyyMM(now);
    const b = S.toInput.value   || yyyyMM(now);
    const from = toDateISOFirst(a);
    const to   = addMonth(b); // exclusivo
    return { kind:"range", from, to, label: `${a} → ${b}` };
  }
  // single month
  const m = S.monthInput.value || yyyyMM(now);
  return { kind:"month", from: toDateISOFirst(m), to: addMonth(m), label: m };
}

function money(n){ return "€ " + Number(n||0).toLocaleString("pt-PT",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function monthLabel(yyyy_mm){
  const [y,m] = yyyy_mm.split("-").map(Number);
  return new Date(y,m-1,1).toLocaleDateString("pt-PT",{month:"short"});
}
function listMonthsBetween(fromISO,toISO){
  const a = new Date(fromISO); const b = new Date(toISO); // b exclusivo
  const keys=[]; let d=new Date(a.getFullYear(),a.getMonth(),1);
  while(d < b){ keys.push(`${d.getFullYear()}-${pad2(d.getMonth()+1)}`); d.setMonth(d.getMonth()+1); }
  return keys;
}

async function fetchMetrics(period){
  // metas e dicionários
  const [{data:types},{data:cats}] = await Promise.all([
    sb.from("transaction_types").select("id,code"),
    sb.from("categories").select("id,name,parent_id,kind")
  ]);
  const TYPE_BY_ID = new Map((types||[]).map(t=>[t.id,t.code]));
  const CAT_BY_ID  = new Map((cats||[]).map(c=>[c.id,c]));
  const catPath = (id)=>{
    const c = CAT_BY_ID.get(id); if(!c) return "(Sem categoria)";
    if(!c.parent_id) return c.name;
    const p = CAT_BY_ID.get(c.parent_id);
    return (p?.name ? p.name+" > " : "") + c.name;
  };

  // transações do período (fechado)
  const { data: tx } = await sb
    .from("transactions")
    .select("date, amount, type_id, category_id, expense_nature")
    .gte("date", period.from).lt("date", period.to).order("date",{ascending:true});

  // agregações
  const months = listMonthsBetween(period.from, period.to);
  const serie = new Map(months.map(k=>[k,{inc:0,exp:0,sav:0,net:0}]));

  const catExp = new Map();        // despesas por categoria (pizza)
  const incByCat = new Map();      // receitas por fonte (insight extra)
  let fixed=0, variable=0;

  (tx||[]).forEach(r=>{
    const ym = String(r.date).slice(0,7);
    const code = TYPE_BY_ID.get(r.type_id);
    const a = Number(r.amount||0);
    const s = serie.get(ym) || {inc:0,exp:0,sav:0,net:0};

    if (code==="INCOME"){ s.inc+=a; s.net+=a;
      const cat = catPath(r.category_id);
      incByCat.set(cat, (incByCat.get(cat)||0)+a);
    }
    else if (code==="EXPENSE"){ s.exp+=a; s.net-=a;
      const cat = catPath(r.category_id);
      catExp.set(cat,(catExp.get(cat)||0)+a);
      const nature = String(r.expense_nature||"").toLowerCase();
      const looksFixed = /(renda|utilidades|internet|tv|luz|g[aá]s|seguro|cr[eé]dito|mensalid|assinatura|telem[oó]vel|empregada)/i.test(cat);
      if (["fixed","fixa","mensal","f"].includes(nature) || looksFixed) fixed+=a; else variable+=a;
    }
    else if (code==="SAVINGS"){ s.sav+=a; s.net-=a; }

    serie.set(ym,s);
  });

  const series = months.map(k=>({ key:k, label:monthLabel(k), ...serie.get(k) }));
  const totals = series.reduce((acc,s)=>({
    inc:acc.inc+s.inc, exp:acc.exp+s.exp, sav:acc.sav+s.sav, net:acc.net+s.net
  }),{inc:0,exp:0,sav:0,net:0});

  return { series, totals, catExp, fixed, variable, incByCat };
}

function renderKPIs(totals){
  S.kIncome.textContent  = money(totals.inc);
  S.kExpense.textContent = money(totals.exp);
  S.kSavings.textContent = money(totals.sav);
  S.kBalance.textContent = money(totals.net);
}

function renderCatPie(catExp){
  if (!S.ctxCat) return;
  const entries = Array.from(catExp.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const labels  = entries.map(e=>e[0]);
  const values  = entries.map(e=>e[1]);
  const total   = values.reduce((a,b)=>a+b,0) || 1;

  const c = new Chart(S.ctxCat,{
    type:"pie",
    data:{ labels, datasets:[{ data:values }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        datalabels:{
          color:"#0f172a", backgroundColor:"rgba(255,255,255,.85)", borderRadius:4, padding:4,
          formatter:(v)=> `${money(v)} (${(v/total*100).toFixed(1)}%)`,
          display:(ctx)=> (ctx.dataset.data[ctx.dataIndex]||0) >= total*0.05 // >=5%
        }
      }
    }
  });
  rptCharts.push(c);

  // legenda com valores
  const colors = c.data.datasets[0].backgroundColor || [];
  S.catLegend.innerHTML = labels.map((lab,i)=>(
    `<div class="rpt-legend__item">
       <span class="rpt-legend__dot" style="background:${colors[i]||'#64748b'}"></span>
       <span style="flex:1">${lab}</span>
       <strong>${money(values[i])}</strong>
       <span style="color:#64748b">&nbsp;(${((values[i]/total)*100).toFixed(1)}%)</span>
     </div>`
  )).join("");
}

function renderFixedDonut(fixed, variable){
  if (!S.ctxFix) return;
  const c = new Chart(S.ctxFix,{
    type:"doughnut",
    data:{ labels:["Fixas","Variáveis"], datasets:[{ data:[fixed,variable] }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ position:"bottom" },
        datalabels:{ color:"#0f172a", backgroundColor:"rgba(255,255,255,.85)", borderRadius:4, padding:4,
          formatter:(v)=> money(v), display:true }
      }
    }
  });
  rptCharts.push(c);
}

function renderSeries(series){
  if (!S.ctxSer) return;
  const labels = series.map(s=>s.label);
  const c = new Chart(S.ctxSer,{
    data:{
      labels,
      datasets:[
        { type:"bar",  label:"Receitas",  data:series.map(s=>s.inc) },
        { type:"bar",  label:"Despesas",  data:series.map(s=>s.exp) },
        { type:"bar",  label:"Poupanças", data:series.map(s=>s.sav) },
        { type:"line", label:"Saldo",     data:series.map(s=>s.net), tension:.25, borderWidth:2, fill:false }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:"index", intersect:false },
      plugins:{ legend:{ position:"top" } },
      scales:{ y:{ beginAtZero:true } }
    }
  });
  rptCharts.push(c);
}

function renderInsights({series, totals, fixed, variable, incByCat}){
  const msgs = [];
  const effort = totals.inc ? (fixed/totals.inc*100) : 0;
  const varPct = totals.exp ? (variable/totals.exp*100) : 0;
  const savPct = totals.inc ? (totals.sav/totals.inc*100) : 0;

  msgs.push(`Taxa de esforço (fixas/receitas): ${effort.toFixed(1)}%`);
  msgs.push(`Despesas variáveis: ${varPct.toFixed(1)}% das despesas`);
  msgs.push(`Taxa de poupança: ${savPct.toFixed(1)}% das receitas`);

  if (series.length >= 2) {
    const last = series[series.length-1].exp;
    const prev = series[series.length-2].exp || 0;
    if (prev) msgs.push(`Variação mensal de despesas: ${(((last-prev)/Math.abs(prev))*100).toFixed(1)}%`);
  }
  if (series.length >= 3) {
    const avg = series.reduce((a,s)=>a+s.exp,0)/series.length;
    const highs = series.filter(s=>s.exp > avg*1.2).map(s=>s.label);
    if (highs.length) msgs.push(`Meses acima da média (despesas): ${highs.join(", ")}`);
  }

  const topIncome = Array.from(incByCat.entries()).sort((a,b)=>b[1]-a[1]).slice(0,3)
                         .map(([k,v])=>`${k}: ${money(v)}`).join(" • ");
  if (topIncome) msgs.push(`Receita por fonte (Top 3): ${topIncome}`);

  S.insights.innerHTML = msgs.map(m=>`<li>${m}</li>`).join("");
}

function renderTable(series){
  const head = `<tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Poupanças</th><th>Saldo</th></tr>`;
  const rows = series.map(s=>`<tr>
    <td>${s.label}</td>
    <td>${money(s.inc)}</td>
    <td>${money(s.exp)}</td>
    <td>${money(s.sav)}</td>
    <td>${money(s.net)}</td>
  </tr>`).join("");
  S.table.innerHTML = `<thead>${head}</thead><tbody>${rows}</tbody>`;
}

async function buildReport(){
  await ensureChartStack();
  destroyRptCharts();

  const period = computePeriod();
  outlet.querySelector("#rpt-title").textContent =
    period.kind === "year" ? `Relatório Financeiro — ${period.label}` :
    period.kind === "range"? `Relatório Financeiro — ${period.label}` :
                             `Relatório Financeiro — ${period.label}`;

  const data = await fetchMetrics(period);
  renderKPIs(data.totals);
  renderCatPie(data.catExp);
  renderFixedDonut(data.fixed, data.variable);
  renderSeries(data.series);
  renderInsights(data);
  renderTable(data.series);
}

// abrir/fechar modal
S.openBtn?.addEventListener("click", ()=>{ S.overlay.classList.remove("hidden"); buildReport(); });
S.closeBtn?.addEventListener("click", ()=>{ S.overlay.classList.add("hidden"); destroyRptCharts(); });
S.previewBtn?.addEventListener("click", buildReport);

// ====== PDF (reutiliza os canvases do modal) ======
async function ensureJsPDF(){
  if (!window.jspdf) {
    await new Promise((res,rej)=>{ const s=document.createElement("script");
      s.src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
      s.onload=res; s.onerror=rej; document.head.appendChild(s); });
  }
}
S.pdfBtn?.addEventListener("click", async ()=>{
  await ensureJsPDF(); const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"pt", format:"a4" });
  const W = doc.internal.pageSize.getWidth(), M = 40; let y = M;

  // título
  doc.setFont("helvetica","bold"); doc.setFontSize(16);
  doc.text(outlet.querySelector("#rpt-title").textContent || "Relatório Financeiro", M, y); y+=18;
  doc.setDrawColor(230); doc.line(M,y,W-M,y); y+=12;

  // KPIs
  const k = [
    ["Receitas", S.kIncome.textContent],
    ["Despesas",S.kExpense.textContent],
    ["Poupanças",S.kSavings.textContent],
    ["Saldo",   S.kBalance.textContent],
  ];
  const cw = (W-2*M)/4; doc.setFont("helvetica","normal"); doc.setFontSize(11);
  k.forEach((kv,i)=>{ const x=M+i*cw; doc.text(kv[0],x,y); doc.setFont("helvetica","bold");
    doc.text(String(kv[1]), x, y+14); doc.setFont("helvetica","normal"); });
  y+=34;

  const addCanvas = (sel, title)=>{
    const c = outlet.querySelector(sel); if(!c) return;
    const img = c.toDataURL("image/png", 1.0);
    doc.setFont("helvetica","bold"); doc.setFontSize(12);
    doc.text(title,M,y); y+=10;
    const iw=W-2*M, ih=220; doc.addImage(img,"PNG",M,y,iw,ih,"","FAST"); y+=ih+16;
    if (y > 760) { doc.addPage(); y=M; }
  };
  addCanvas("#rpt-cat-pie",   "Distribuição de despesas por categorias");
  addCanvas("#rpt-fixed-donut","Fixas vs Variáveis");
  addCanvas("#rpt-series",    "Séries mensais");

  // pequenos insights (texto)
  const txt = S.insights.textContent || "";
  if (txt) {
    doc.setFont("helvetica","bold"); doc.text("Insights:", M, y); y+=12; doc.setFont("helvetica","normal");
    const lines = doc.splitTextToSize(txt, W-2*M); doc.text(lines, M, y); y += 14 + lines.length*12;
  }

  doc.save("Relatorio.pdf");
});


  // Utilidades de datas/labels
  const monthPT = (y, m) =>
    new Date(y, m - 1, 1).toLocaleDateString("pt-PT", {
      month: "short",
      year: "numeric",
    });
  const monthsOfYear = (y) =>
    Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);

  function palette(n) {
    // paleta HSL para cores estáveis de legendas/labels
    return Array.from(
      { length: n },
      (_, i) => `hsl(${Math.round((360 * i) / Math.max(1, n))} 70% 55%)`
    );
  }

  // Pega elementos do modal
  const R = {
    overlay: $("#report-overlay"),
    openBtn: $("#btn-report-open"),
    closeBtn: $("#rpt-close"),
    scope: $("#rpt-scope"),
    month: $("#rpt-month"),
    preview: $("#rpt-preview"),
    pdfBtn: $("#rpt-pdf"),

    kpiIncome: $("#rpt-kpi-income"),
    kpiExpense: $("#rpt-kpi-expense"),
    kpiSavings: $("#rpt-kpi-savings"),
    kpiBalance: $("#rpt-kpi-balance"),

    catLegend: $("#rpt-cat-legend"),
    insights: $("#rpt-insights"),
    table: $("#rpt-table"),

    ctxCat: $("#rpt-cat-pie")?.getContext("2d"),
    ctxFixed: $("#rpt-fixed-donut")?.getContext("2d"),
    ctxSeries: $("#rpt-series")?.getContext("2d"),

    charts: [],
  };

  function destroyReportCharts() {
    R.charts.forEach((c) => {
      try {
        c.destroy();
      } catch {}
    });
    R.charts = [];
  }

  function categoryPathBuilder(cats) {
    const byId = new Map(cats.map((c) => [c.id, c]));
    return function path(catId) {
      const c = byId.get(catId);
      if (!c) return "(Sem categoria)";
      if (!c.parent_id) return c.name;
      const p = byId.get(c.parent_id);
      return (p?.name ? p.name + " > " : "") + c.name;
    };
  }

  // heurística fixa/variável (fallback)
  const FIX_HINTS = [
    "renda",
    "utilidades",
    "água",
    "agua",
    "luz",
    "gás",
    "gas",
    "tv",
    "internet",
    "seguro",
    "crédito",
    "credito",
    "mensal",
    "empregada",
    "telemóvel",
    "telemovel",
    "iuc",
  ];
  const looksFixed = (name) =>
    FIX_HINTS.some((h) => (name || "").toLowerCase().includes(h));

  async function fetchFor(scope, refYYYYMM) {
    // intervalo
    const y = Number(refYYYYMM.slice(0, 4));
    const m = Number(refYYYYMM.slice(5, 7));
    const from = scope === "year" ? `${y}-01-01` : `${refYYYYMM}-01`;
    const to =
      scope === "year"
        ? `${y + 1}-01-01`
        : new Date(y, m, 1).toISOString().slice(0, 10);

    // tipos e categorias
    const [{ data: types2 }, { data: cats2 }] = await Promise.all([
      sb.from("transaction_types").select("id,code"),
      sb.from("categories").select("id,name,parent_id"),
    ]);
    const TYPE_BY_ID = new Map((types2 || []).map((t) => [t.id, t.code]));
    const pathOf = categoryPathBuilder(cats2 || []);

    // transações do período
    const { data: tx } = await sb
      .from("transactions")
      .select("date, amount, type_id, category_id, expense_nature")
      .gte("date", from)
      .lt("date", to)
      .order("date", { ascending: true });

    // agrega
    const monthly = new Map(); // yyyy-mm -> {inc,exp,sav,net}
    const catExp = new Map(); // "Pai > Filho" -> total (despesa)
    let fixed = 0,
      variable = 0;

    (tx || []).forEach((r) => {
      const k = String(r.date).slice(0, 7);
      const code = TYPE_BY_ID.get(r.type_id);
      const a = Number(r.amount || 0);

      const mm = monthly.get(k) || { inc: 0, exp: 0, sav: 0, net: 0 };
      if (code === "INCOME") {
        mm.inc += a;
        mm.net += a;
      } else if (code === "EXPENSE") {
        mm.exp += a;
        mm.net -= a;

        const nature = String(r.expense_nature || "").toLowerCase();
        const catName = pathOf(r.category_id);
        const isFixed =
          ["fixed", "fixa", "mensal", "f"].includes(nature) || looksFixed(catName);
        isFixed ? (fixed += a) : (variable += a);

        catExp.set(catName, (catExp.get(catName) || 0) + a);
      } else if (code === "SAVINGS") {
        mm.sav += a;
        mm.net -= a;
      }
      monthly.set(k, mm);
    });

    // série (com buracos preenchidos)
    const series =
      scope === "year"
        ? monthsOfYear(y).map((k) => {
            const mObj = monthly.get(k) || { inc: 0, exp: 0, sav: 0, net: 0 };
            return {
              key: k,
              label: monthPT(Number(k.slice(0, 4)), Number(k.slice(5, 7))),
              ...mObj,
            };
          })
        : [
            {
              key: refYYYYMM,
              label: monthPT(y, m),
              ...(monthly.get(refYYYYMM) || { inc: 0, exp: 0, sav: 0, net: 0 }),
            },
          ];

    // totais
    const totals = series.reduce(
      (acc, s) => ({
        inc: acc.inc + s.inc,
        exp: acc.exp + s.exp,
        sav: acc.sav + s.sav,
        net: acc.net + s.net,
      }),
      { inc: 0, exp: 0, sav: 0, net: 0 }
    );

    return { series, totals, catExp, fixed, variable };
  }

  function renderKpis({ totals }) {
    R.kpiIncome && (R.kpiIncome.textContent = money(totals.inc));
    R.kpiExpense && (R.kpiExpense.textContent = money(totals.exp));
    R.kpiSavings && (R.kpiSavings.textContent = money(totals.sav));
    R.kpiBalance && (R.kpiBalance.textContent = money(totals.net));
  }

  function renderCatPie({ catExp }) {
    if (!R.ctxCat) return;

    const entries = Array.from(catExp.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    const labels = entries.map(([name]) => name);
    const values = entries.map(([, v]) => v);
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const colors = palette(labels.length);

    const c = new Chart(R.ctxCat, {
      type: "pie",
      data: { labels, datasets: [{ data: values, backgroundColor: colors }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            color: "#0f172a",
            backgroundColor: "rgba(255,255,255,.85)",
            borderRadius: 4,
            padding: 4,
            formatter: (v) => `${money(v)} (${((v / total) * 100).toFixed(1)}%)`,
            display: (ctx) => {
              const v = ctx.dataset.data[ctx.dataIndex] || 0;
              return v / total >= 0.05; // >= 5%
            },
          },
        },
      },
    });
    R.charts.push(c);

    // legenda externa com valores + %
    if (R.catLegend) {
      R.catLegend.innerHTML = labels
        .map((lab, i) => {
          const v = values[i];
          const pct = ((v / total) * 100).toFixed(1).replace(".", ",") + "%";
          return `<div class="rpt-legend__item">
            <span class="rpt-legend__dot" style="background:${colors[i]}"></span>
            <span style="flex:1">${lab}</span>
            <strong>${money(v)}</strong>
            <span style="color:#64748b">&nbsp;(${pct})</span>
          </div>`;
        })
        .join("");
    }
  }

  function renderFixedDonut({ fixed, variable }) {
    if (!R.ctxFixed) return;

    const colors = ["hsl(200 80% 45%)", "hsl(20 85% 55%)"];

    const c = new Chart(R.ctxFixed, {
      type: "doughnut",
      data: {
        labels: ["Fixas", "Variáveis"],
        datasets: [{ data: [fixed, variable], backgroundColor: colors }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          datalabels: {
            color: "#0f172a",
            backgroundColor: "rgba(255,255,255,.85)",
            borderRadius: 4,
            padding: 4,
            formatter: (v) => money(v),
            display: true,
          },
        },
      },
    });
    R.charts.push(c);
  }

  function renderSeries({ series }) {
    if (!R.ctxSeries) return;

    const labels = series.map((s) => s.label);
    const c = new Chart(R.ctxSeries, {
      data: {
        labels,
        datasets: [
          { type: "bar", label: "Receitas", data: series.map((s) => s.inc) },
          { type: "bar", label: "Despesas", data: series.map((s) => s.exp) },
          { type: "bar", label: "Poupanças", data: series.map((s) => s.sav) },
          {
            type: "line",
            label: "Saldo",
            data: series.map((s) => s.net),
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
    R.charts.push(c);
  }

  function renderInsights({ series, totals, fixed, variable }) {
    if (!R.insights) return;

    const msgs = [];
    const effort = totals.inc ? (fixed / totals.inc) * 100 : 0;
    const varPct = totals.exp ? (variable / totals.exp) * 100 : 0;
    const savPct = totals.inc ? (totals.sav / totals.inc) * 100 : 0;

    msgs.push(`Taxa de esforço (fixas/receita): ${effort.toFixed(1)}%`);
    msgs.push(`Despesas variáveis: ${varPct.toFixed(1)}% das despesas`);
    msgs.push(`Poupança: ${savPct.toFixed(1)}% da receita`);

    if (series.length > 3) {
      const avgExp = series.reduce((a, s) => a + s.exp, 0) / series.length;
      const outliers = series
        .filter((s) => s.exp > avgExp * 1.2)
        .map((s) => s.label);
      if (outliers.length)
        msgs.push(`Meses com despesas acima da média: ${outliers.join(", ")}`);
    }
    R.insights.innerHTML = msgs.map((m) => `<li>${m}</li>`).join("");
  }

  function renderTable({ series }) {
    if (!R.table) return;

    const head =
      "<tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Poupanças</th><th>Saldo</th></tr>";
    const rows = series
      .map(
        (s) => `<tr>
      <td>${s.label}</td>
      <td>${money(s.inc)}</td>
      <td>${money(s.exp)}</td>
      <td>${money(s.sav)}</td>
      <td>${money(s.net)}</td>
    </tr>`
      )
      .join("");
    R.table.innerHTML = `<thead>${head}</thead><tbody>${rows}</tbody>`;
  }

  async function buildReport() {
    // Se a secção de relatórios não existir no HTML, não faz nada
    if (!R.overlay) return;

    await ensureCharts();
    destroyReportCharts();

    if (!R.month.value) R.month.value = todayYYYYMM();
    const scopeVal = R.scope?.value || "month";
    const data = await fetchFor(scopeVal, R.month.value);

    renderKpis(data);
    renderCatPie(data);
    renderFixedDonut(data);
    renderSeries(data);
    renderInsights(data);
    renderTable(data);
  }

  // abrir/fechar/refresh
  R.openBtn?.addEventListener("click", () => {
    if (!R.overlay) return;
    R.overlay.classList.remove("hidden");
    buildReport();
  });
  R.closeBtn?.addEventListener("click", () => {
    if (!R.overlay) return;
    R.overlay.classList.add("hidden");
  });
  R.preview?.addEventListener("click", buildReport);
  R.scope?.addEventListener("change", buildReport);
  R.month?.addEventListener("change", buildReport);

  // ------------------ PDF (jsPDF + canvases) ------------------
  async function ensureJsPDF() {
    if (window.jspdf) return;
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  R.pdfBtn?.addEventListener("click", async () => {
    if (!R.overlay) return;

    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const M = 36;
    let y = M;

    // Cabeçalho (podes editar aqui o título/subtítulo como developer)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Relatório Financeiro", M, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const scopeStr = R.scope?.value === "year" ? "Anual" : "Mensal";
    doc.text(`Âmbito: ${scopeStr}  •  Período: ${R.month?.value || ""}`, M, y);
    y += 12;
    doc.setDrawColor(230);
    doc.line(M, y, W - M, y);
    y += 14;

    // KPIs (linha)
    const k = [
      ["Receitas", R.kpiIncome?.textContent || "—"],
      ["Despesas", R.kpiExpense?.textContent || "—"],
      ["Poupanças", R.kpiSavings?.textContent || "—"],
      ["Saldo", R.kpiBalance?.textContent || "—"],
    ];
    const cw = (W - 2 * M) / 4;
    doc.setFontSize(11);
    k.forEach((kv, i) => {
      const x = M + i * cw;
      doc.text(kv[0], x, y);
      doc.setFont("helvetica", "bold");
      doc.text(String(kv[1]), x, y + 14);
      doc.setFont("helvetica", "normal");
    });
    y += 34;

    // helper: desenha um canvas como imagem
    function addCanvas(id, title) {
      const c = $(id);
      if (!c) return;
      const img = c.toDataURL("image/png", 1.0);
      doc.setFont("helvetica", "bold");
      doc.text(title, M, y);
      y += 10;
      const iw = W - 2 * M;
      const ih = 220; // altura fixa (bom equilíbrio)
      doc.addImage(img, "PNG", M, y, iw, ih, undefined, "FAST");
      y += ih + 16;
      if (y > doc.internal.pageSize.getHeight() - 120) {
        doc.addPage();
        y = M;
      }
    }

    addCanvas("#rpt-cat-pie", "Distribuição de despesas por categorias");
    addCanvas("#rpt-fixed-donut", "Fixas vs Variáveis");
    addCanvas("#rpt-series", "Séries mensais");

    // Rodapé (edita a assinatura/brand aqui)
    const footer = "Gerado por Gestão de Finanças Familiares";
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      footer,
      W - M,
      doc.internal.pageSize.getHeight() - M / 2,
      { align: "right" }
    );

    doc.save(
      `Relatorio_${scopeStr}_${(R.month?.value || "").replace("-", "_")}.pdf`
    );
  });

  // valor por defeito do mês
  const monthInp = $("#rpt-month");
  if (monthInp && !monthInp.value) {
    monthInp.value = todayYYYYMM();
  }
}