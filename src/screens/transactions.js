export async function init() {
  const sb = window.sb;

  // --------- Elements ---------
  const $ = s => document.querySelector(s);
  const tbody = $("#tx-tbody");
  const summaryEl = $("#tx-summary");

  const fltSearch = $("#flt-search");
  const fltType   = $("#flt-type");
  const fltStatus = $("#flt-status");
  const fltMonth  = $("#flt-month");

  // --------- State ---------
  const PAGE_SIZE = 30;
  let page = 0;
  let all = [];        // dados crus carregados da BD (paginados e acumulados)
  let filtered = [];   // dados filtrados para render

  // --------- Helpers UI ---------
  const ptDate = iso => new Date(iso).toLocaleDateString("pt-PT");
  const money = (n, sign, cls) => {
    const val = Number(n || 0);
    const s = sign ? (val > 0 ? "+" : val < 0 ? "-" : "") : "";
    return `<span class="${cls||""}">${s}€${Math.abs(val).toFixed(2).replace(".", ",")}</span>`;
  };
  const icon = (name) => {
    if (name === "up")   return `<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#16a34a" d="M7 14l5-5 5 5z"/></svg>`;
    if (name === "down") return `<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#ef4444" d="M7 10l5 5 5-5z"/></svg>`;
    if (name === "save") return `<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#2563eb" d="M17 3H5a2 2 0 0 0-2 2v14l4-4h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/></svg>`;
    return "";
  };
  const typeBadge = (code) => {
    if (code === "INCOME")  return `<span class="badge" style="background:#ecfdf5;color:#065f46;border:1px solid #d1fae5;display:inline-flex;gap:6px;align-items:center">${icon("up")}Receita</span>`;
    if (code === "EXPENSE") return `<span class="badge" style="background:#fef2f2;color:#7f1d1d;border:1px solid #fee2e2;display:inline-flex;gap:6px;align-items:center">${icon("down")}Despesa</span>`;
    if (code === "SAVINGS") return `<span class="badge" style="background:#eff6ff;color:#1e3a8a;border:1px solid #dbeafe;display:inline-flex;gap:6px;align-items:center">${icon("save")}Poupança</span>`;
    if (code?.startsWith("TRANSFER")) return `<span class="badge">Transferência</span>`;
    return `<span class="badge">Outro</span>`;
  };
  const statusBadge = (name_pt) => {
    const isDone = name_pt?.toLowerCase().startsWith("conclu");
    return `<span class="badge" style="${isDone?'background:#ecfdf5;color:#065f46;border:1px solid #d1fae5':'background:#f1f5f9;color:#334155;border:1px solid #e2e8f0'}">${name_pt || "-"}</span>`;
  };

  // --------- Data fetch ---------
  // Para construir "Pai > Filho" sem duplicações visuais
  const categoriesMap = new Map(); // id -> {name,parent_id}
  async function ensureCategoriesLoaded() {
    if (categoriesMap.size) return;
    const { data, error } = await sb.from("categories").select("id,name,parent_id").order("name");
    if (error) { console.error(error); return; }
    (data||[]).forEach(c => categoriesMap.set(c.id, { name:c.name, parent_id:c.parent_id }));
  }
  function categoryPath(catId) {
    if (!catId) return "(Sem categoria)";
    const c = categoriesMap.get(catId);
    if (!c) return "(Sem categoria)";
    if (!c.parent_id) return c.name;
    const p = categoriesMap.get(c.parent_id);
    return (p?.name ? p.name + " > " : "") + c.name;
  }

  // carrega opções de status para o filtro
  async function fillStatusFilter() {
    const { data, error } = await sb.from("statuses").select("id, name_pt").order("id");
    if (error) return console.error(error);
    fltStatus.innerHTML = `<option value="all">Todos os status</option>` + 
      (data||[]).map(s => `<option value="${s.name_pt}">${s.name_pt}</option>`).join("");
  }

  async function fetchPage(reset=false) {
    if (reset) { page = 0; all = []; tbody.innerHTML = ""; }
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    // filtro por mês (server-side para reduzir tráfego)
    const monthVal = fltMonth?.value || null;
    let q = sb.from("transactions")
      .select(`
        id, date, amount, signed_amount, description, location,
        account_id, category_id, status_id, type_id,
        accounts(name),
        transaction_types(code,name_pt),
        statuses(name_pt)
      `)
      .order("date", { ascending:false })
      .order("created_at", { ascending:false })
      .range(from, to);

    if (monthVal) {
      const [y,m] = monthVal.split("-");
      const start = new Date(Number(y), Number(m)-1, 1).toISOString().slice(0,10);
      const end   = new Date(Number(y), Number(m),   1).toISOString().slice(0,10);
      q = q.gte("date", start).lt("date", end);
    }

    const { data, error } = await q;
    if (error) {
      tbody.innerHTML = `<tr><td colspan="8" style="padding:12px;color:#991b1b">Erro: ${error.message}</td></tr>`;
      return;
    }

    await ensureCategoriesLoaded();

    const rows = (data||[]).map(tx => ({
      id: tx.id,
      date: tx.date,
      type_code: tx.transaction_types?.code || null,
      type_name: tx.transaction_types?.name_pt || null,
      amount: Number(tx.amount || 0),
      signed_amount: Number(tx.signed_amount || 0),
      description: tx.description || "",
      location: tx.location || "",
      account: tx.accounts?.name || "",
      status_name: tx.statuses?.name_pt || "",
      category_path: categoryPath(tx.category_id),
      raw: tx
    }));

    all = all.concat(rows);
    page++;
  }

  // --------- Filtering + render ---------
  function applyFilters() {
    const tFilter = fltType?.value || "all";
    const sFilter = fltStatus?.value || "all";
    const q = (fltSearch?.value || "").trim().toLowerCase();

    filtered = all.filter(r => {
      const matchesType   = tFilter === "all" || r.type_code === tFilter;
      const matchesStatus = sFilter === "all" || r.status_name === sFilter;
      const matchesSearch = !q
        || r.description.toLowerCase().includes(q)
        || r.category_path.toLowerCase().includes(q)
        || (r.location||"").toLowerCase().includes(q)
        || (r.account||"").toLowerCase().includes(q);
      return matchesType && matchesStatus && matchesSearch;
    });

    renderTable();
  }

  function renderTable() {
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="padding:12px;color:#475569">Nenhuma transação encontrada</td></tr>`;
      summaryEl.textContent = "Mostrando 0 de " + all.length + " transações";
      return;
    }

    const html = filtered.map(r => {
      const colorCls =
        r.type_code === "INCOME"  ? "color:#16a34a;font-weight:700" :
        r.type_code === "EXPENSE" ? "color:#ef4444;font-weight:700" :
        r.type_code === "SAVINGS" ? "color:#2563eb;font-weight:700" : "";
      const val = r.type_code === "INCOME"  ? r.amount
               : r.type_code === "EXPENSE" ? -r.amount
               : r.amount;

      return `
      <tr class="tx-row" data-id="${r.id}" data-type="${r.type_code||''}" style="cursor:pointer">
        <td style="padding:10px;border-bottom:1px solid var(--border)">${ptDate(r.date)}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border)">${typeBadge(r.type_code)}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border);text-align:right"><span style="${colorCls}">${money(val, false)}</span></td>
        <td style="padding:10px;border-bottom:1px solid var(--border)">${r.category_path}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border)"><span title="${r.description.replace(/"/g,'&quot;')}">${r.description || "-"}</span></td>
        <td style="padding:10px;border-bottom:1px solid var(--border)"><span class="badge" style="background:#fff;border:1px solid #e5e7eb">${r.account || "-"}</span></td>
        <td style="padding:10px;border-bottom:1px solid var(--border)">${statusBadge(r.status_name)}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border)">${r.location || "-"}</td>
      </tr>`;
    }).join("");

    tbody.innerHTML = html;
    summaryEl.textContent = `Mostrando ${filtered.length} de ${all.length} transações`;
  }

  // --------- Edit modal (comporta-se como antes) ---------
  const modal = $("#tx-edit-modal");
  const closeModal = () => modal.setAttribute("hidden", "");
  const openModal  = () => modal.removeAttribute("hidden");

  const REF = { accounts:[], regularities:[], methods:[], statuses:[], types:[] };

  async function loadRefs() {
    const [acc, reg, pm, st, tt] = await Promise.all([
      sb.from("accounts").select("id,name").order("name"),
      sb.from("regularities").select("id,name_pt").order("id"),
      sb.from("payment_methods").select("id,code,name_pt").order("id"),
      sb.from("statuses").select("id,code,name_pt").order("id"),
      sb.from("transaction_types").select("id,code,name_pt").order("id")
    ]);
    if (acc.error||reg.error||pm.error||st.error||tt.error) throw (acc.error||reg.error||pm.error||st.error||tt.error);
    REF.accounts=acc.data; REF.regularities=reg.data; REF.methods=pm.data; REF.statuses=st.data; REF.types=tt.data;
  }

  function fillSelect(el, rows, label, value="id") {
    el.innerHTML = (rows||[]).map(r => `<option value="${r[value]}">${r[label]}</option>`).join("");
  }

  async function loadCategoriesForType(typeCode, selectedId=null) {
    const kind = typeCode === "INCOME" ? "income" : typeCode === "EXPENSE" ? "expense" : typeCode === "SAVINGS" ? "savings" : null;
    if (!kind) { $("#ed-category").innerHTML = ""; return; }
    const { data, error } = await sb.from("categories").select("id,name,parent_id").eq("kind", kind).order("name");
    if (error) { console.error(error); return; }
    const parents = new Map((data||[]).filter(c=>!c.parent_id).map(c=>[c.id,c.name]));
    const seen = new Set();
    const rows = [];
    (data||[]).forEach(c => {
      const label = c.parent_id ? `${parents.get(c.parent_id)||""} > ${c.name}` : c.name;
      if (seen.has(label)) return;
      seen.add(label);
      rows.push({ id:c.id, label });
    });
    fillSelect($("#ed-category"), rows, "label");
    if (selectedId) $("#ed-category").value = selectedId;
  }

  async function openEdit(id) {
    try {
      await loadRefs();
      const { data: tx, error } = await sb.from("transactions")
        .select("*, transaction_types(code), categories(kind,expense_nature_default)")
        .eq("id", id).single();
      if (error) throw error;

      const tcode = tx.transaction_types?.code;

      $("#ed-date").value   = tx.date;
      $("#ed-amount").value = Number(tx.amount || 0).toFixed(2);

      fillSelect($("#ed-account"), REF.accounts, "name");
      fillSelect($("#ed-regularity"), REF.regularities, "name_pt");
      fillSelect($("#ed-method"), REF.methods, "name_pt");
      fillSelect($("#ed-status"), REF.statuses, "name_pt");
      fillSelect($("#ed-type"), REF.types, "name_pt");

      $("#ed-account").value    = tx.account_id || "";
      $("#ed-regularity").value = tx.regularity_id || "";
      $("#ed-method").value     = tx.payment_method_id || "";
      $("#ed-status").value     = tx.status_id || "";
      $("#ed-type").value       = tx.type_id || "";
      $("#ed-desc").value  = tx.description || "";
      $("#ed-loc").value   = tx.location || "";
      $("#ed-notes").value = tx.notes || "";
      $("#ed-nature").value = tx.expense_nature || "";

      await loadCategoriesForType(tcode, tx.category_id || null);

      const isTransfer = tcode && tcode.startsWith("TRANSFER");
      $("#ed-hint").textContent = isTransfer
        ? "⚠️ Parte de uma transferência. Editar/eliminar aqui está bloqueado."
        : "";
      $("#ed-save").disabled   = !!isTransfer;
      $("#ed-delete").disabled = !!isTransfer;

      $("#tx-edit-meta").textContent = `${ptDate(tx.date)} • ${tcode}`;
      $("#ed-save").onclick = async () => {
        try {
          const upd = {
            date: $("#ed-date").value,
            amount: Number($("#ed-amount").value || 0),
            account_id: $("#ed-account").value || null,
            regularity_id: $("#ed-regularity").value ? Number($("#ed-regularity").value) : null,
            payment_method_id: $("#ed-method").value ? Number($("#ed-method").value) : null,
            status_id: $("#ed-status").value ? Number($("#ed-status").value) : null,
            category_id: $("#ed-category").value || null,
            description: $("#ed-desc").value || null,
            location: $("#ed-loc").value || null,
            notes: $("#ed-notes").value || null,
            expense_nature: ($("#ed-nature").value || null)
          };
          if (!(upd.amount > 0)) throw new Error("Valor inválido.");
          const { error } = await sb.from("transactions").update(upd).eq("id", id);
          if (error) throw error;

          // Atualiza a linha na cache local
          const idx = all.findIndex(r => r.id === id);
          if (idx >= 0) {
            all[idx].date = upd.date;
            all[idx].amount = upd.amount;
            all[idx].description = upd.description || "";
            all[idx].location = upd.location || "";
            all[idx].status_name = REF.statuses.find(x => x.id === upd.status_id)?.name_pt || all[idx].status_name;
            all[idx].account = REF.accounts.find(x => x.id === upd.account_id)?.name || all[idx].account;
            all[idx].category_path = categoryPath(upd.category_id);
            // signed_amount é recalculado no trigger; para manter simples, recalcula por tipo
            const code = tcode;
            all[idx].signed_amount = code==="EXPENSE" ? -upd.amount : upd.amount;
          }

          applyFilters();
          closeModal();
        } catch (e) {
          alert("Erro a guardar: " + (e.message || e));
        }
      };

      $("#ed-delete").onclick = async () => {
        if (!confirm("Eliminar este registo?")) return;
        try {
          const { error } = await sb.from("transactions").delete().eq("id", id);
          if (error) throw error;
          all = all.filter(r => r.id !== id);
          applyFilters();
          closeModal();
        } catch (e) {
          alert("Erro a eliminar: " + (e.message || e));
        }
      };

      $("#ed-cancel").onclick = closeModal;
      modal.addEventListener("click", (ev)=>{ if (ev.target?.hasAttribute("data-close")) closeModal(); });

      openModal();
    } catch (e) {
      console.error(e);
      alert("Não foi possível abrir a edição: " + (e.message || e));
    }
  }

  // --------- Events ---------
  $("#btn-refresh")?.addEventListener("click", async ()=> {
    await fetchPage(true);
    applyFilters();
  });
  $("#btn-load-more")?.addEventListener("click", async ()=> {
    await fetchPage(false);
    applyFilters();
  });

  fltSearch?.addEventListener("input", applyFilters);
  fltType?.addEventListener("change", applyFilters);
  fltStatus?.addEventListener("change", async ()=>{ await fetchPage(true); applyFilters(); });
  fltMonth?.addEventListener("change", async ()=>{ await fetchPage(true); applyFilters(); });

  // click linha → editar
  tbody.addEventListener("click", (ev) => {
    const tr = ev.target.closest("tr.tx-row");
    if (!tr) return;
    const type = tr.dataset.type || "";
    if (type.startsWith("TRANSFER")) {
      alert("Editar transferências aqui está bloqueado para manter o par consistente.");
      return;
    }
    openEdit(tr.dataset.id);
  });

  // --------- Init ---------
  await fillStatusFilter();
  await fetchPage(true);
  applyFilters();
}
