//export async function init() {
  //document.getElementById("btn-logout")?.addEventListener("click", async () => {
    //await window.sb.auth.signOut();
    //location.hash = "#/";
  //});
//}
// src/screens/settings.js
export async function init({ sb } = {}) {
  sb = sb || window.sb;

  // === logout, se já existia no teu settings ===
  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    await sb.auth.signOut();
    location.hash = "#/";
  });

  // -------- utilidades UI --------
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString("pt-PT", { minimumFractionDigits:2, maximumFractionDigits:2 });

  // Carregar PapaParse se necessário
  async function ensurePapa() {
    if (window.Papa) return;
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // Lê CSV para [{...}] (headers na 1ª linha)
  async function readCSV(file) {
    await ensurePapa();
    return new Promise((resolve, reject) => {
      window.Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => String(h||"").trim(),
        complete: ({ data }) => resolve(data.map(row => {
          const obj = {};
          for (const k in row) obj[k.trim()] = typeof row[k]==="string" ? row[k].trim() : row[k];
          return obj;
        })),
        error: reject
      });
    });
  }

  // ---------- caches do lado do cliente ----------
  const cache = {
    types: null, pm: null, st: null, reg: null, accs: null, cats: null,
    hasTxNature: false
  };

  async function warmMeta() {
    const [types, pm, st, reg, accs, cats, txNature] = await Promise.all([
      sb.from("transaction_types").select("id,code"),
      sb.from("payment_methods").select("id,code"),
      sb.from("statuses").select("id,code"),
      sb.from("regularities").select("id,code"),
      sb.from("accounts").select("id,name").order("name"),
      sb.from("categories").select("id,name,parent_id,user_id,kind"),
      sb.from("transactions").select("id, expense_nature").limit(1) // se der erro, não existe
    ]);

    cache.types = new Map((types.data||[]).map(r => [r.code, r.id]));
    cache.pm    = new Map((pm.data||[]).map(r => [r.code, r.id]));
    cache.st    = new Map((st.data||[]).map(r => [r.code, r.id]));
    cache.reg   = new Map((reg.data||[]).map(r => [r.code, r.id]));
    cache.accs  = new Map((accs.data||[]).map(r => [r.name, r.id]));

    cache.cats = new Map(); // key "parentId|name" → {id,name,parent_id,kind}
    (cats.data||[]).forEach(c => {
      const key = `${c.parent_id || "root"}|${c.name}`;
      // preferir categoria do utilizador (user_id != null) em vez de global
      const ex = cache.cats.get(key);
      if (!ex || (ex.user_id == null && c.user_id != null)) cache.cats.set(key, c);
    });

    cache.hasTxNature = !txNature.error;
  }
  await warmMeta();

  // helpers de mapeamento/normalização
  const parseISO = (s) => (new Date(s).toString() !== "Invalid Date") ? s.slice(0,10) : null;
  const parseAmount = (s) => {
    if (s === null || s === undefined) return NaN;
    const x = String(s).replace(/\s/g,"").replace(",",".");
    return Number(x);
  };

  // garantir conta por nome (opcionalmente cria)
  async function ensureAccountByName(name, createIfMissing = false) {
    const id = cache.accs.get(name);
    if (id) return id;
    if (!createIfMissing) return null;
    const { data:{ user } } = await sb.auth.getUser();
    const { data, error } = await sb.from("accounts").insert([{
      user_id: user.id, name, type: "bank", currency: "EUR"
    }]).select("id").single();
    if (error) throw error;
    cache.accs.set(name, data.id);
    return data.id;
  }

  // garantir categoria por "Pai > Filho" (cria se faltar)
  async function ensureCategoryByPath(path, kind, userId, createIfMissing = true) {
    if (!path) return null;
    const parts = path.split(">").map(s => s.trim()).filter(Boolean);
    let parentId = null;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const key = `${parentId || "root"}|${name}`;
      let hit = cache.cats.get(key);
      if (!hit && createIfMissing) {
        // criar categoria (sempre do utilizador)
        const payload = { user_id: userId, parent_id: parentId, name, kind: (i===0 ? kind : kind) };
        const { data, error } = await sb.from("categories").insert([payload]).select("id,parent_id,name,kind,user_id").single();
        if (error) throw error;
        hit = data;
        cache.cats.set(key, data);
      }
      if (!hit) return null;
      parentId = hit.id;
    }
    return parentId;
  }

  // ---------- UI: Transações ----------
  let txRows = [];     // linhas cruas do CSV
  let txValid = [];    // payloads prontos a inserir
  let txErrors = [];   // mensagens

  function renderPreview(containerId, rows) {
    const wrap = $(containerId);
    const thead = wrap.querySelector("thead");
    const tbody = wrap.querySelector("tbody");
    if (!rows.length) { wrap.style.display="none"; return; }
    wrap.style.display="block";
    const cols = Object.keys(rows[0]);
    thead.innerHTML = `<tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr>`;
    tbody.innerHTML = rows.slice(0, 12).map(r =>
      `<tr>${cols.map(c=>`<td>${(r[c]??"")}</td>`).join("")}</tr>`
    ).join("");
  }

  function summary(elId, ok, err) {
    $(elId).innerHTML = `
      <div><span class="ok">✔</span> Válidas: <strong>${ok}</strong> &nbsp; &middot; &nbsp;
           <span class="err">✖</span> Erros: <strong>${err}</strong></div>
    `;
  }

  $("btn-validate-tx")?.addEventListener("click", async () => {
    const f = $("imp-tx-file")?.files?.[0];
    if (!f) return alert("Escolhe um CSV de transações.");
    txErrors = []; txValid = []; txRows = await readCSV(f);

    const { data:{ user } } = await sb.auth.getUser();
    const createCats = $("opt-create-cats")?.checked;
    const createAccs = $("opt-create-accs")?.checked;

    for (let i=0;i<txRows.length;i++) {
      const r = txRows[i];

      const date = parseISO(r.date);
      const typeCode = (r.type_code||"").toUpperCase();
      const amount = parseAmount(r.amount);
      const accName = r.account_name;
      const catPath = r.category_path;

      if (!date)           { txErrors.push(`L${i+2}: data inválida`); continue; }
      if (!["INCOME","EXPENSE","SAVINGS"].includes(typeCode)) { txErrors.push(`L${i+2}: type_code inválido`); continue; }
      if (!(amount > 0))   { txErrors.push(`L${i+2}: amount inválido`); continue; }

      let account_id = await ensureAccountByName(accName, createAccs);
      if (!account_id)     { txErrors.push(`L${i+2}: conta "${accName}" não existe`); continue; }

      const kind = (typeCode==="INCOME")?"income" : (typeCode==="SAVINGS")?"savings" : "expense";
      let category_id = await ensureCategoryByPath(catPath, kind, user.id, !!createCats);
      if (!category_id && catPath) { txErrors.push(`L${i+2}: categoria "${catPath}" não encontrada`); continue; }

      const payload = {
        user_id: user.id,
        type_id: cache.types.get(typeCode),
        regularity_id: cache.reg.get((r.regularity_code||"").toUpperCase()) || null,
        account_id,
        category_id,
        payment_method_id: cache.pm.get((r.payment_method_code||"").toUpperCase()) || null,
        status_id: cache.st.get((r.status_code||"").toUpperCase()) || null,
        date,
        amount,
        description: r.description || null,
        location: r.location || null,
        notes: r.notes || null,
        currency: (r.currency||"EUR").toUpperCase()
      };

      // se a coluna existir no teu schema, podes importar expense_nature (fixa/variável)
      if (cache.hasTxNature && r.expense_nature) {
        const v = String(r.expense_nature).toLowerCase();
        if (["fixed","variable","fixa","variável","var"].includes(v)) {
          payload.expense_nature = (v.startsWith("fix")) ? "fixed" : "variable";
        }
      }

      txValid.push(payload);
    }

    $("btn-import-tx").disabled = txValid.length === 0;
    summary("tx-summary", txValid.length, txErrors.length);
    renderPreview("tx-preview", txRows);
    if (txErrors.length) console.warn("Erros CSV (transações):", txErrors);
  });

  $("btn-import-tx")?.addEventListener("click", async () => {
    if (!txValid.length) return;
    $("btn-import-tx").disabled = true;

    let ok = 0, fail = 0;
    for (let i = 0; i < txValid.length; i += 300) {
      const batch = txValid.slice(i, i+300);
      const { error } = await sb.from("transactions").insert(batch);
      if (error) { console.error(error); fail += batch.length; }
      else ok += batch.length;
      $("tx-summary").innerHTML = `A importar… ${ok+fail}/${txValid.length}`;
    }

    $("tx-summary").innerHTML = `<strong>Concluído.</strong> ✔ ${ok} &nbsp; ✖ ${fail}`;
    $("btn-import-tx").disabled = false;
  });

  // ---------- UI: Transferências ----------
  let trfRows = [];
  let trfValid = [];
  let trfErrors = [];

  $("btn-validate-trf")?.addEventListener("click", async () => {
    const f = $("imp-trf-file")?.files?.[0];
    if (!f) return alert("Escolhe um CSV de transferências.");
    trfErrors = []; trfValid = []; trfRows = await readCSV(f);

    for (let i=0;i<trfRows.length;i++){
      const r = trfRows[i];
      const date = parseISO(r.date);
      const amount = parseAmount(r.amount);
      const fromName = r.from_account_name;
      const toName   = r.to_account_name;

      if (!date) { trfErrors.push(`L${i+2}: data inválida`); continue; }
      if (!(amount>0)) { trfErrors.push(`L${i+2}: amount inválido`); continue; }

      const fromId = cache.accs.get(fromName);
      const toId   = cache.accs.get(toName);
      if (!fromId) { trfErrors.push(`L${i+2}: conta origem "${fromName}" não existe`); continue; }
      if (!toId)   { trfErrors.push(`L${i+2}: conta destino "${toName}" não existe`); continue; }
      if (fromId === toId) { trfErrors.push(`L${i+2}: contas iguais`); continue; }

      trfValid.push({
        p_from_account: fromId,
        p_to_account:   toId,
        p_amount:       amount,
        p_date:         date,
        p_description:  r.description || null,
        p_notes:        r.notes || null,
        p_status_code: (r.status_code||"DONE").toUpperCase()
      });
    }

    $("btn-import-trf").disabled = trfValid.length === 0;
    summary("trf-summary", trfValid.length, trfErrors.length);
    renderPreview("trf-preview", trfRows);
    if (trfErrors.length) console.warn("Erros CSV (transferências):", trfErrors);
  });

  $("btn-import-trf")?.addEventListener("click", async () => {
    if (!trfValid.length) return;
    $("btn-import-trf").disabled = true;

    // pequena “pool” de concorrência para não saturar o PostgREST
    const CONC = 4;
    let idx = 0, ok = 0, fail = 0;

    async function worker() {
      while (idx < trfValid.length) {
        const my = idx++;
        const args = trfValid[my];
        const { error } = await sb.rpc("create_transfer", args);
        if (error) { console.error(error); fail++; }
        else ok++;
        $("trf-summary").innerHTML = `A importar… ${ok+fail}/${trfValid.length}`;
      }
    }
    await Promise.all(Array.from({length:CONC}, worker));
    $("trf-summary").innerHTML = `<strong>Concluído.</strong> ✔ ${ok} &nbsp; ✖ ${fail}`;
    $("btn-import-trf").disabled = false;
  });
}
