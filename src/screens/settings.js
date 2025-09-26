// src/screens/settings.js
export async function init({ sb, outlet } = {}) {
  sb     = sb || window.sb;
  outlet = outlet || document.getElementById("outlet");

  const $ = (sel) => outlet.querySelector(sel);
  const info = (t) => { const el = $("#imp-info"); if (el) el.textContent = t || ""; };
  const log  = (t) => { const el = $("#imp-log");  if (el) el.textContent += (el.textContent ? "\n" : "") + t; console.log("[import]", t); };

  const fileEl   = $("#imp-file");
  const btnParse = $("#imp-parse");
  const btnImp   = $("#imp-import");
  const preview  = $("#imp-preview");
  const progress = $("#imp-progress");

  if (!fileEl || !btnParse || !btnImp || !preview) {
    console.warn("Import UI não encontrado em settings.html");
    return;
  }

  // ---------------- helpers de texto ----------------
  function normalizeHeader(h) {
    return String(h || "")
      .replace(/^\uFEFF/, "")
      .trim().toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[ãâáàä]/g, "a").replace(/[êéèë]/g, "e")
      .replace(/[îíìï]/g, "i").replace(/[õôóòö]/g, "o")
      .replace(/[ûúùü]/g, "u").replace(/ç/g, "c");
  }
  function normalize(v) {
    if (v == null) return "";
    let t = String(v).trim();
    if (/^(null|nil|na|—|-)$/i.test(t)) return "";
    if (t.length === 0) return "";
    // remove aspas exteriores
    if (t.startsWith("\"") && t.endsWith("\"")) t = t.slice(1, -1).replace(/""/g, "\"");
    return t;
  }
  function detectDelimiter(text) {
    const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
    const cands = [",",";","\t","|"];
    let best = ",", bestScore = -1;
    for (const d of cands) {
      const re = new RegExp("\\" + d + "(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)", "g");
      const score = (sample.match(re) || []).length;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }
  function splitCSVLine(line, delim) {
    const re = new RegExp("\\" + delim + "(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)");
    return line.split(re).map(s => {
      s = s.trim();
      if (s.startsWith("\"") && s.endsWith("\"")) s = s.slice(1, -1).replace(/""/g, "\"");
      return s;
    });
  }
  function parseAmount(s) {
    s = normalize(s);
    if (!s) return NaN;
    let t = s.replace(/[€\s]/g, "");
    // remove separador de milhares europeu
    t = t.replace(/\.(?=\d{3}(\D|$))/g, "");
    // vírgula decimal -> ponto
    t = t.replace(",", ".");
    const v = Number(t);
    return Number.isFinite(v) ? v : NaN;
  }
  function toISO(s) {
    s = normalize(s);
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // DD/MM/YYYY
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  // ---------------- dicionários ----------------
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

  const TYPE_BY_LABEL = new Map();
  (types || []).forEach(t => {
    TYPE_BY_LABEL.set(normalizeHeader(t.code), t.id);
    TYPE_BY_LABEL.set(normalizeHeader(t.name_pt), t.id);
  });
  const STATUS_BY_LABEL = new Map();
  (sts || []).forEach(s => {
    STATUS_BY_LABEL.set(normalizeHeader(s.code), s.id);
    STATUS_BY_LABEL.set(normalizeHeader(s.name_pt), s.id);
  });
  const PM_BY_LABEL = new Map();
  (pms || []).forEach(p => {
    PM_BY_LABEL.set(normalizeHeader(p.code), p.id);
    PM_BY_LABEL.set(normalizeHeader(p.name_pt), p.id);
  });
  const REG_BY_LABEL = new Map();
  (regs || []).forEach(r => {
    REG_BY_LABEL.set(normalizeHeader(r.code), r.id);
    REG_BY_LABEL.set(normalizeHeader(r.name_pt), r.id);
  });
  const ACC_BY_NAME = new Map((accounts || []).map(a => [normalizeHeader(a.name), a.id]));

  const catById = new Map((cats || []).map(c => [c.id, c]));
  const CAT_BY_PATH = new Map();
  (cats || []).forEach(c => {
    if (c.parent_id) {
      const p = catById.get(c.parent_id);
      if (p) CAT_BY_PATH.set(normalizeHeader(`${p.name} > ${c.name}`), c.id);
    }
    CAT_BY_PATH.set(normalizeHeader(c.name), c.id);
  });

  const ALIASES = {
    date:        ["date","data"],
    amount:      ["amount","valor","montante","value"],
    type:        ["type","tipo","type_code","tipo_codigo","tipo_code"],
    account:     ["account","conta","account_name","nome_conta","conta_nome","accountid","account_id"],
    category:    ["category","categoria","categoria_path","category_path","categoria pai > filho","pai > filho"],
    description: ["description","descricao","descrição","desc"],
    payment_method: ["payment_method","metodo","método","payment_method_code","metodo_code","metodo_codigo"],
    status:      ["status","estado","status_code","estado_code","estado_codigo"],
    regularity:  ["regularity","regularidade","regularity_code","regularidade_code","regularidade_codigo"],
    notes:       ["notes","notas"],
    location:    ["location","local","localizacao","localização"],
    currency:    ["currency","moeda"],
    expense_nature: ["expense_nature","natureza_despesa","fixa_variavel","fixa/variavel"]
  };

  function pick(row, key) {
    const keys = ALIASES[key] || [key];
    for (let i = 0; i < keys.length; i++) {
      const hn = normalizeHeader(keys[i]);
      const v = normalize(row[hn]);
      if (v) return v;
    }
    return "";
  }

  // ---------------- estado ----------------
  let mappedRows = [];

  // ---------------- PREVIEW ----------------
  btnParse.addEventListener("click", async () => {
    const logBox = $("#imp-log"); if (logBox) logBox.textContent = "";
    info("");
    mappedRows = [];
    btnImp.disabled = true;
    preview.innerHTML = "";
    progress.hidden = true;

    const file = fileEl.files && fileEl.files[0];
    if (!file) { info("Escolhe um ficheiro .csv"); return; }

    const rawText = await file.text();
    const text = rawText.replace(/^\uFEFF/, "");
    const delim = detectDelimiter(text);

    const linesAll = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (linesAll.length < 2) { info("CSV sem linhas suficientes."); return; }

    const headerCols = splitCSVLine(linesAll[0], delim);
    const headersNorm = headerCols.map(normalizeHeader);
    log(`Delimitador detetado: "${delim === "\t" ? "\\t" : delim}" | Cabeçalhos: ${headerCols.join(" | ")}`);

    // construir linhas em objetos simples
    const rows = [];
    for (let i = 1; i < linesAll.length; i++) {
      const cols = splitCSVLine(linesAll[i], delim);
      const o = {};
      for (let j = 0; j < headersNorm.length; j++) {
        o[headersNorm[j]] = cols[j] != null ? cols[j] : "";
      }
      rows.push(o);
    }

    const userId = (await sb.auth.getUser()).data?.user?.id || null;
    const errors = [];
    const out = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      const dateISO = toISO(pick(r, "date"));
      if (!dateISO) { errors.push(`L${i+2}: data inválida "${pick(r,"date")}"`); continue; }

      let amountNum = parseAmount(pick(r, "amount"));
      if (!Number.isFinite(amountNum)) { errors.push(`L${i+2}: valor inválido "${pick(r,"amount")}"`); continue; }
      const sign = amountNum < 0 ? -1 : 1;
      amountNum = Math.abs(amountNum);

      const accName = pick(r, "account");
      const accountId = ACC_BY_NAME.get(normalizeHeader(accName));
      if (!accountId) { errors.push(`L${i+2}: conta não encontrada "${accName}"`); continue; }

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
        } else if (sign > 0) {
          typeId = TYPE_BY_LABEL.get("income");
        }
      }
      if (!typeId) { errors.push(`L${i+2}: tipo inválido "${typeLabel}"`); continue; }

      const statusId         = STATUS_BY_LABEL.get(normalizeHeader(pick(r,"status"))) || STATUS_BY_LABEL.get("done") || null;
      const paymentMethodId  = PM_BY_LABEL.get(normalizeHeader(pick(r,"payment_method"))) || null;
      const regularityId     = REG_BY_LABEL.get(normalizeHeader(pick(r,"regularity"))) || null;

      out.push({
        user_id: userId,
        type_id: typeId,
        regularity_id: regularityId,
        account_id: accountId,
        category_id: categoryId,
        payment_method_id: paymentMethodId,
        status_id: statusId,
        date: dateISO,
        amount: amountNum, // trigger define o sinal via type_id
        description: pick(r, "description") || null,
        location: pick(r, "location") || null,
        notes: pick(r, "notes") || null,
        currency: pick(r, "currency") || "EUR"
      });
    }

    mappedRows = out;

    // preview (até 10)
    const head = ["Data","Valor","Tipo/Conta","Categoria","Descrição"];
    const rowsHtml = out.slice(0, 10).map(p => {
      const t = (types || []).find(x => x.id === p.type_id);
      const tName = t ? (t.name_pt || t.code) : "";
      const acc = (accounts || []).find(a => a.id === p.account_id)?.name || "";
      const cat = p.category_id ? (catById.get(p.category_id)?.name || "") : "(sem)";
      return `<tr>
        <td style="padding:6px;border-bottom:1px solid #f3f3f3">${p.date}</td>
        <td style="padding:6px;border-bottom:1px solid #f3f3f3">€ ${p.amount.toFixed(2)}</td>
        <td style="padding:6px;border-bottom:1px solid #f3f3f3">${tName} / ${acc}</td>
        <td style="padding:6px;border-bottom:1px solid #f3f3f3">${cat}</td>
        <td style="padding:6px;border-bottom:1px solid #f3f3f3">${p.description || ""}</td>
      </tr>`;
    }).join("");

    preview.innerHTML =
      `<table style="width:100%;font-size:.9rem;border-collapse:collapse">
        <thead><tr>${head.map(h=>`<th style="text-align:left;border-bottom:1px solid #eee;padding:6px">${h}</th>`).join("")}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;

    info(`Registos válidos: ${out.length} / ${rows.length}.`);
    if (errors.length) {
      const extra = errors.length > 10 ? `\n(+${errors.length-10} mais…)` : "";
      log("Avisos:\n- " + errors.slice(0, 10).join("\n- ") + extra);
    }
    btnImp.disabled = out.length === 0;
  });

  // ---------------- IMPORT ----------------
  btnImp.addEventListener("click", async () => {
    if (!mappedRows.length) { info("Nada para importar. Faz primeiro a pré-visualização."); return; }
    progress.hidden = false; progress.value = 0;
    btnImp.disabled = true; btnParse.disabled = true; fileEl.disabled = true;
    const logBox = $("#imp-log"); if (logBox) logBox.textContent = ""; info("A importar…");

    try {
      const CHUNK = 200;
      let done = 0;
      while (done < mappedRows.length) {
        const batch = mappedRows.slice(done, done + CHUNK);
        const { error } = await sb.from("transactions").insert(batch);
        if (error) throw error;
        done += batch.length;
        progress.value = Math.round((done / mappedRows.length) * 100);
      }
      info(`✅ Importação concluída: ${mappedRows.length} registos inseridos.`);
      log("Concluído.");
    } catch (e) {
      info("❌ Falha na importação.");
      log(e && e.message ? e.message : String(e));
    } finally {
      setTimeout(() => { progress.hidden = true; }, 800);
      btnImp.disabled = false; btnParse.disabled = false; fileEl.disabled = false;
    }
  });
}
// === RELATÓRIOS (modal + geração) ===========================================
(function attachReports() {
  const sb = window.sb;
  const outlet = document.getElementById("outlet");
  const $ = (sel) => outlet.querySelector(sel);

  const dlg     = $("#report-modal");
  const btnOpen = $("#report-open");
  const btnClose= $("#report-close");
  const btnGen  = $("#report-generate");
  const monthEl = $("#rep-month");
  const yearEl  = $("#rep-year");
  const chartsEl= $("#rep-include-charts");
  const notesEl = $("#rep-include-notes");

  if (!dlg || !btnOpen || !btnGen) return; // ecrã settings sem bloco? sai silenciosamente

  // defaults
  const now = new Date();
  monthEl.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  yearEl.innerHTML = Array.from({length:8}).map((_,i)=>{
    const y = now.getFullYear()-i;
    return `<option value="${y}">${y}</option>`;
  }).join("");

  function open(){ dlg.classList.remove("hidden"); }
  function close(){ dlg.classList.add("hidden"); }
  btnOpen.addEventListener("click", open);
  btnClose?.addEventListener("click", close);
  dlg.addEventListener("click", (e)=>{ if (e.target===dlg) close(); });

  // alternar mensal/anual (mostramos ambos os campos mas usa-se o ativo)
  const radios = dlg.querySelectorAll('input[name="rep-mode"]');

  function activeMode(){
    const r = Array.from(radios).find(x=>x.checked);
    return r ? r.value : "monthly";
  }

  btnGen.addEventListener("click", async () => {
    btnGen.disabled = true;
    try{
      const mode = activeMode();
      const includeCharts = chartsEl.checked;
      const includeNotes  = notesEl.checked;

      if (mode === "monthly") {
        const ym = monthEl.value || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        await generateMonthlyReport(sb, ym, { includeCharts, includeNotes });
      } else {
        const year = Number(yearEl.value || now.getFullYear());
        await generateAnnualReport(sb, year, { includeCharts, includeNotes });
      }
      close();
    } catch(e){
      alert("Erro a gerar relatório: " + (e?.message || e));
    } finally {
      btnGen.disabled = false;
    }
  });

  // ---------------- helpers de agregação ----------------
  const money = (n) => "€ " + Number(n||0).toLocaleString("pt-PT",{minimumFractionDigits:2, maximumFractionDigits:2});
  const labelMonthPT = (isoYYYYMM) => {
    const [y,m] = isoYYYYMM.split("-").map(Number);
    return new Date(y, m-1, 1).toLocaleDateString("pt-PT",{month:"long", year:"numeric"});
  };
  const catPathBuilder = (() => {
    let catMap = new Map();
    return async function(id, preload) {
      if (catMap.size===0 || preload===true) {
        const { data } = await sb.from("categories").select("id,name,parent_id");
        catMap = new Map((data||[]).map(c=>[c.id, c]));
      }
      const c = catMap.get(id);
      if (!c) return "(Sem categoria)";
      const p = c.parent_id ? catMap.get(c.parent_id) : null;
      return p ? `${p.name} > ${c.name}` : c.name;
    };
  })();

  // cria janela de impressão com HTML pronto
  function openPrintWindow(html, title="Relatório"){
    const win = window.open("", "_blank");
    if (!win) throw new Error("Pop-up bloqueado");
    win.document.open();
    win.document.write(`
<!doctype html><html lang="pt-PT"><head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#0f172a; }
  h1 { font-size: 20px; margin:0 0 6px; }
  h2 { font-size: 16px; margin:18px 0 8px; }
  .muted { color:#64748b; }
  .kpis { display:grid; grid-template-columns: repeat(4,1fr); gap:10px; }
  .kpi { border:1px solid #e5e7eb; border-radius:10px; padding:10px; }
  .kpi b { font-size:18px; display:block; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { text-align:left; padding:6px 8px; border-bottom:1px solid #eef2f7; }
  .bar { height:8px; background:#e5e7eb; border-radius:999px; overflow:hidden; }
  .bar > i { display:block; height:100%; background:#0ea5e9; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .section { border:1px solid #e5e7eb; border-radius:12px; padding:12px; }
  .right { text-align:right; }
  .small { font-size:11px; color:#64748b; }
  .tag { display:inline-block; padding:2px 6px; border:1px solid #94a3b8; border-radius:999px; font-size:10px; color:#475569; }
  .note { margin-top:8px; padding:8px; border-left:3px solid #94a3b8; background:#f8fafc; }
  @media print { .no-print { display:none !important; } }
</style>
</head><body>${html}</body></html>`);
    win.document.close();
    // pequena pausa para render e abre o diálogo de impressão
    setTimeout(()=> win.print(), 200);
  }

  // ---------------- relatório mensal ----------------
  async function generateMonthlyReport(sb, ym, opts){
    const from = ym + "-01";
    const d = new Date(ym+"-01T00:00:00");
    const to = new Date(d.getFullYear(), d.getMonth()+1, 1).toISOString().slice(0,10);

    // dicionários leves
    const { data: types } = await sb.from("transaction_types").select("id,code");
    const TYPE = new Map((types||[]).map(t=>[t.id, t.code]));

    const { data: tx } = await sb
      .from("transactions")
      .select("date, amount, signed_amount, type_id, category_id, description")
      .gte("date", from).lt("date", to)
      .order("date", { ascending:true });

    const rows = tx || [];
    const totalIncome  = rows.filter(r=>TYPE.get(r.type_id)==="INCOME").reduce((s,r)=>s+r.amount,0);
    const totalExpense = rows.filter(r=>TYPE.get(r.type_id)==="EXPENSE").reduce((s,r)=>s+r.amount,0);
    const totalSavings = rows.filter(r=>TYPE.get(r.type_id)==="SAVINGS").reduce((s,r)=>s+r.amount,0);
    const net = rows.reduce((s,r)=>s + Number(r.signed_amount||0),0);

    // categorias (apenas despesas)
    const perCat = new Map();
    for (const r of rows) {
      if (TYPE.get(r.type_id) !== "EXPENSE") continue;
      const path = await catPathBuilder(r.category_id);
      perCat.set(path, (perCat.get(path)||0) + Number(r.amount||0));
    }
    const catArr = Array.from(perCat.entries()).map(([name,total])=>({name,total}))
      .sort((a,b)=>b.total-a.total);

    const totalExp = catArr.reduce((s,x)=>s+x.total,0) || 1;
    const top = catArr.slice(0,10);
    const otherTotal = Math.max(0, totalExp - top.reduce((s,x)=>s+x.total,0));

    // tabela de movimentos (primeiros 40)
    const movRows = rows.slice(0,40).map(r=>{
      const type = TYPE.get(r.type_id);
      const cat  = type==="EXPENSE" ? (perCat.size ? "" : "") : "";
      return `<tr>
        <td>${r.date}</td>
        <td>${type==="INCOME"?"Receita":type==="EXPENSE"?"Despesa":"Poupança"}</td>
        <td class="right">${money(r.amount)}</td>
        <td>${type==="EXPENSE" ? "" : ""}</td>
        <td>${r.description||""}</td>
      </tr>`;
    }).join("");

    const chartBars = opts.includeCharts ? `
      <div class="grid2">
        <div class="section"><h2>Top categorias</h2>
          <table>${top.map(c=>`
            <tr>
              <td>${c.name}</td>
              <td class="right small">${(c.total/totalExp*100).toFixed(1)}%</td>
            </tr>
            <tr><td colspan="2"><div class="bar"><i style="width:${(c.total/totalExp*100).toFixed(1)}%"></i></div></td></tr>
          `).join("")}
          ${otherTotal>0?`<tr><td>Outras</td><td class="right small">${(otherTotal/totalExp*100).toFixed(1)}%</td></tr>`:""}
          </table>
        </div>
        <div class="section"><h2>Resumo</h2>
          <div class="kpis">
            <div class="kpi">Receitas<b>${money(totalIncome)}</b></div>
            <div class="kpi">Despesas<b>${money(totalExpense)}</b></div>
            <div class="kpi">Poupanças<b>${money(totalSavings)}</b></div>
            <div class="kpi">Saldo líquido<b>${money(net)}</b></div>
          </div>
        </div>
      </div>` : `
        <div class="section">
          <h2>Resumo</h2>
          <ul>
            <li>Receitas: <b>${money(totalIncome)}</b></li>
            <li>Despesas: <b>${money(totalExpense)}</b></li>
            <li>Poupanças: <b>${money(totalSavings)}</b></li>
            <li>Saldo líquido: <b>${money(net)}</b></li>
          </ul>
        </div>`;

    const notes = opts.includeNotes ? `<div class="note">
      <div class="small">Notas</div>
      <div>—</div>
    </div>` : "";

    const html = `
      <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <h1>Relatório Mensal</h1>
          <div class="muted">${labelMonthPT(ym)}</div>
        </div>
        <span class="tag">Gerado em ${new Date().toLocaleString("pt-PT")}</span>
      </header>

      ${chartBars}

      <div class="section" style="margin-top:12px">
        <h2>Movimentos (amostra)</h2>
        <table>
          <thead><tr><th>Data</th><th>Tipo</th><th class="right">Valor</th><th></th><th>Descrição</th></tr></thead>
          <tbody>${movRows || `<tr><td colspan="5" class="small">Sem movimentos.</td></tr>`}</tbody>
        </table>
        ${notes}
      </div>
    `;

    openPrintWindow(html, `Relatório ${labelMonthPT(ym)}`);
  }

  // ---------------- relatório anual ----------------
  async function generateAnnualReport(sb, year, opts){
    const from = `${year}-01-01`, to = `${year+1}-01-01`;
    const { data, error } = await sb
      .from("v_monthly_summary")
      .select("month,income,expense,savings,net")
      .gte("month", from).lt("month", to)
      .order("month", { ascending:true });
    if (error) throw error;

    const series = (data||[]).map(r => ({
      label: new Date(r.month).toLocaleDateString("pt-PT",{month:"short"}),
      income: Number(r.income||0),
      expense: Number(r.expense||0),
      savings: Number(r.savings||0),
      net: Number(r.net||0)
    }));

    const totInc = series.reduce((s,x)=>s+x.income,0);
    const totExp = series.reduce((s,x)=>s+x.expense,0);
    const totSav = series.reduce((s,x)=>s+x.savings,0);
    const totNet = series.reduce((s,x)=>s+x.net,0);

    const rowsHtml = series.map(m=>`
      <tr>
        <td>${m.label}</td>
        <td class="right">${money(m.income)}</td>
        <td class="right">${money(m.expense)}</td>
        <td class="right">${money(m.savings)}</td>
        <td class="right"><b>${money(m.net)}</b></td>
      </tr>`).join("");

    const bars = opts.includeCharts ? `
      <div class="section">
        <h2>Evolução Mensal (barras)</h2>
        <table>${series.map(m=>`
          <tr><td style="width:84px">${m.label}</td>
            <td style="width:36%">Receitas<div class="bar"><i style="width:${totInc? (m.income/totInc*100).toFixed(1):0}%"></i></div></td>
            <td style="width:36%">Despesas<div class="bar"><i style="width:${totExp? (m.expense/totExp*100).toFixed(1):0}%"></i></div></td>
          </tr>`).join("")}
        </table>
      </div>` : "";

    const html = `
      <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <h1>Relatório Anual</h1>
          <div class="muted">${year}</div>
        </div>
        <span class="tag">Gerado em ${new Date().toLocaleString("pt-PT")}</span>
      </header>

      <div class="kpis" style="margin:8px 0 12px">
        <div class="kpi">Receitas<b>${money(totInc)}</b></div>
        <div class="kpi">Despesas<b>${money(totExp)}</b></div>
        <div class="kpi">Poupanças<b>${money(totSav)}</b></div>
        <div class="kpi">Saldo líquido<b>${money(totNet)}</b></div>
      </div>

      <div class="grid2">
        <div class="section">
          <h2>Tabela mensal</h2>
          <table>
            <thead><tr><th>Mês</th><th class="right">Receitas</th><th class="right">Despesas</th><th class="right">Poupanças</th><th class="right">Saldo</th></tr></thead>
            <tbody>${rowsHtml || `<tr><td colspan="5" class="small">Sem dados.</td></tr>`}</tbody>
          </table>
        </div>
        ${bars}
      </div>
    `;
    openPrintWindow(html, `Relatório Anual ${year}`);
  }
})();
