// src/screens/settings.js
export async function init({ sb, outlet } = {}) {
  sb = sb || window.sb;
  outlet = outlet || document.getElementById("outlet");

  const $  = (sel) => outlet.querySelector(sel);
  const log = (msg) => { const el=$("#imp-log"); if (el) el.textContent += (el.textContent? "\n":"") + msg; console.log("[import]", msg); };
  const info= (msg) => { const el=$("#imp-info"); if (el) el.textContent = msg||""; };

  const fileEl    = $("#imp-file");
  const btnParse  = $("#imp-parse");
  const btnImport = $("#imp-import");
  const preview   = $("#imp-preview");
  const progress  = $("#imp-progress");

  if (!fileEl || !btnParse || !btnImport || !preview) {
    console.warn("Import UI não encontrado. Garante que o settings.html tem a secção #csv-import.");
    return;
  }

  // ===== helpers de texto/normalização =====
  const normalizeHeader = (h) => String(h||"")
    .replace(/^\uFEFF/,"")               // BOM
    .trim().toLowerCase()
    .replace(/\s+/g,' ')
    .replace(/[ãâáàä]/g,'a').replace(/[êéèë]/g,'e')
    .replace(/[îíìï]/g,'i').replace(/[õôóòö]/g,'o')
    .replace(/[ûúùü]/g,'u').replace(/ç/g,'c');

  const normalize = (v) => {
    if (v == null) return "";
    let t = String(v).trim();
    if (/^(null|nil|na|—|-|)$/i.test(t)) return "";
    // remove aspas exteriores
    t = t.replace(/^"(.*)"$/,'$1').replace(/""/g,'"');
    return t;
  };

  const detectDelimiter = (text) => {
    const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
    const candidates = [",",";","\t","|"];
    const scores = candidates.map(d => (sample.match(new RegExp(`\\${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`,"g"))||[]).length);
    return candidates[scores.indexOf(Math.max(...scores))] || ";";
  };

  // split de linha que respeita aspas
  const splitCSVLine = (line, delim) => {
    const re = new RegExp(`${delim}(?=(?:[^"]*"[^"]*")*[^"]*$)`);
    return line.split(re).map(s => s.replace(/^"(.*)"$/,'$1').replace(/""/g,'"'));
  };

  const parseAmount = (s) => {
    s = normalize(s);
    if (!s) return NaN;
    let t = s.replace(/[€\s]/g,'');
    // remove separador de milhares
    t = t.replace(/\.(?=\d{3}(?:\D|$))/g,'');
    // vírgula decimal -> ponto
    t = t.replace(',', '.');
    const v = Number(t);
    return isFinite(v) ? v : NaN;
  };

  const toISO = (s) => {
    s = normalize(s);
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // DD/MM/YYYY
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString().slice(0,10);
  };

  // ===== dicionários de referência =====
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
  (types||[]).forEach(t => {
    TYPE_BY_LABEL.set(normalizeHeader(t.code), t.id);
    TYPE_BY_LABEL.set(normalizeHeader(t.name_pt), t.id);
  });
  const STATUS_BY_LABEL = new Map();
  (sts||[]).forEach(s => {
    STATUS_BY_LABEL.set(normalizeHeader(s.code), s.id);
    STATUS_BY_LABEL.set(normalizeHeader(s.name_pt), s.id);
  });
  const PM_BY_LABEL = new Map();
  (pms||[]).forEach(p => {
    PM_BY_LABEL.set(normalizeHeader(p.code), p.id);
    PM_BY_LABEL.set(normalizeHeader(p.name_pt), p.id);
  });
  const REG_BY_LABEL = new Map();
  (regs||[]).forEach(r => {
    REG_BY_LABEL.set(normalizeHeader(r.code), r.id);
    REG_BY_LABEL.set(normalizeHeader(r.name_pt), r.id);
  });
  const ACC_BY_NAME = new Map((accounts||[]).map(a => [normalizeHeader(a.name), a.id]));

  const catById = new Map((cats||[]).map(c => [c.id, c]));
  const CAT_BY_PATH = new Map();
  (cats||[]).forEach(c => {
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

  const pick = (row, key) => {
    const keys = ALIASES[key] || [key];
    for (const k of keys) {
      const v = normalize(row[normalizeHeader(k)]);
      if (v) return v;
    }
    return "";
  };

  // ========= estado =========
  let mappedRows = [];

  // ========= PREVIEW =========
  btnParse.addEventListener("click", async () => {
    $("#imp-log").textContent = "";
    info("");
    mappedRows = [];
    btnImport.disabled = true;
    preview.innerHTML = "";
    progress.hidden = true;

    const file = fileEl.files?.[0];
    if (!file) { info("Escolhe um ficheiro .csv"); return; }

    const rawText = await file.text();
    const text = rawText.replace(/^\uFEFF/,"");
    const delim = detectDelimiter(text);

    const allLines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (allLines.length < 2) { info("CSV sem linhas suficientes."); return; }

    const headerCols = splitCSVLine(allLines[0], delim);
    const headersNorm = headerCols.map(normalizeHeader);

    // para debug leve:
    log(`Delimitador detetado: "${delim === "\t" ? "\\t" : delim}" | Cabeçalhos: ${headerCols.join(" | ")}`);

    const rows = [];
    for (let i=1;i<allLines.length;i++) {
      const cols = splitCSVLine(allLines[i], delim);
      const o = {};
      headersNorm.forEach((hn, idx) => { o[hn] = cols[idx] ?? ""; });
      rows.push(o);
    }

    const userId = (await sb.auth.getUser()).data?.user?.id || null;
    const errors = [];
    const out = [];

    for (let i=0; i<rows.length; i++) {
      const r = rows[i];

      // data
      const dateISO = toISO(pick(r,"date"));
      if (!dateISO) { errors.push(`L${i+2}: data inválida "${pick(r,"date")}"`); continue; }

      // valor (guarda sinal para inferência mas depois converte para abs)
      let amountNum = parseAmount(pick(r,"amount"));
      if (isNaN(amountNum)) { errors.push(`L${i+2}: valor inválido "${pick(r,"amount")}"`); continue; }
      const sign = amountNum < 0 ? -1 : 1;
      amountNum = Math.abs(amountNum);

      // conta
      const accName = pick(r,"account");
      const accountId = ACC_BY_NAME.get(normalizeHeader(accName));
      if (!accountId) { errors.push(`L${i+2}: conta não encontrada "${accName}"`); continue; }

      // tipo (mapa + inferência por sinal/categoria)
      const typeLabel = pick(r,"type");
      let typeId = TYPE_BY_LABEL.get(normalizeHeader(typeLabel)) || null;

      const catRaw = pick(r,"category");
      let categoryId = null;
      if (catRaw) categoryId = CAT_BY_PATH.get(normalizeHeader(catRaw)) || null;

      if (!typeId) {
        // inferir
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
        amount: amountNum, // o trigger vai aplicar o sinal via type_id
        description: pick(r,"description") || null,
        location: pick(r,"location") || null,
        notes: pick(r,"notes") || null,
        currency: pick(r,"currency") || "EUR",
      });
    }

    mappedRows = out;

    // preview (10 linhas)
    const head = ["Data","Valor","Tipo/Conta","Categoria","Descrição"];
    const html = [
      `<table style="width:100%;font-size:.9rem;border-collapse:collapse">`,
      `<thead><tr>${head.map(h=>`<th style="text-align:left;border-bottom:1px solid #eee;padding:6px">${h}</th>`).join("")}</tr></thead>`,
      `<tbody>`,
      ...out.slice(0,10).map(p => {
        const tName = (types||[]).find(x => x.id===p.type_id)?.name_pt || (types||[]).find(x => x.id===p.type_id)?.code || "";
        const acc   = (accounts||[]).find(a => a.id===p.account_id)?.name || "";
        const cat   = p.category_id ? (catById.get(p.category_id)?.name) : "(sem)";
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

    info(`Registos válidos: ${out.length} / ${rows.length}.`);
    if (errors.length) log("Avisos:\n- " + errors.slice(0,10).join("\n- ") + (errors.length>10?`\n(+${errors.length-10} mais…)`:""));
    btnImport.disabled = out.length === 0;
  });

  // ========= IMPORT =========
  btnImport.addEventListener("click", async () => {
    if (!mappedRows.length) { info("Nada para importar. Faz primeiro a pré-visualização."); return; }
    progress.hidden = false; progress.value = 0;
    btnImport.disabled = true; btnParse.disabled = true; fileEl.disabled = true;
    $("#imp-log").textContent = ""; info("A importar…");

    try {
      const CHUNK = 200;
      for (let i=0; i<mappedRows.length; i+=CHUNK) {
        const batch = mappedRows.slice(i, i+CHUNK);
        const { error } = await sb.from("transactions").insert(batch);
        if (error) throw error;
        progress.value = Math.round(((i+batch.length)/mappedRows.length)*100);
      }
      info(`✅ Importação concluída: ${mappedRows.length} registos inseridos.`);
      log("Concluído.");
    } catch (e) {
      info("❌ Falha na importação.");
      log(e?.message || String(e));
    } finally {
      btnImport.disabled = false; btnParse.disabled = false; fileEl.disabled = false;
      setTimeout(()=> progress.hidden = true, 1200);
    }
  });
}
