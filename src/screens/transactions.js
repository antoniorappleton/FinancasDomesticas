// src/screens/transactions.js
export async function init(ctx = {}) {
  const sb = window.sb;
  const outlet = ctx.outlet || document.getElementById("outlet");
  const qs = (sel) => outlet?.querySelector(sel) || document.querySelector(sel);

  const dom = {
    tbody:       qs("#tx-tbody"),
    summary:     qs("#tx-summary"),
    fltSearch:   qs("#flt-search"),
    fltType:     qs("#flt-type"),
    fltStatus:   qs("#flt-status"),
    fltMonth:    qs("#flt-month"),
    btnRefresh:  qs("#btn-refresh"),
    btnMore:     qs("#btn-load-more"),
    modal:       qs("#tx-edit-modal"),
    ed: {
      date:      qs("#ed-date"),
      amount:    qs("#ed-amount"),
      account:   qs("#ed-account"),
      regularity:qs("#ed-regularity"),
      method:    qs("#ed-method"),
      status:    qs("#ed-status"),
      type:      qs("#ed-type"),
      category:  qs("#ed-category"),
      desc:      qs("#ed-desc"),
      loc:       qs("#ed-loc"),
      notes:     qs("#ed-notes"),
      nature:    qs("#ed-nature"),
      save:      qs("#ed-save"),
      del:       qs("#ed-delete"),
      cancel:    qs("#ed-cancel"),
      meta:      qs("#tx-edit-meta"),
      hint:      qs("#ed-hint"),
    }
  };

  const required = [
    ["#tx-tbody", dom.tbody],
    ["#tx-summary", dom.summary],
    ["#flt-type", dom.fltType],
    ["#flt-status", dom.fltStatus],
    ["#tx-edit-modal", dom.modal],
  ];
  const missing = required.filter(([_,el]) => !el).map(([s]) => s);
  if (missing.length) {
    (outlet || document.body).innerHTML = `
      <section class="card">
        <strong>Erro ao carregar o ecrã.</strong><br>
        Faltam elementos no HTML: <code>${missing.join(", ")}</code>.
      </section>`;
    return;
  }

  const PAGE_SIZE = 30;
  let page = 0;
  let all = [];
  let filtered = [];
  const categoriesMap = new Map();

  const ptDate  = iso => new Date(iso).toLocaleDateString("pt-PT");
  const moneyFmt = (n) => "€ " + Number(n||0).toLocaleString("pt-PT", {minimumFractionDigits:2, maximumFractionDigits:2});
  const typeBadge = (code) => {
    if (code === "INCOME")  return `<span class="badge" style="background:#ecfdf5;color:#065f46;border:1px solid #d1fae5">Receita</span>`;
    if (code === "EXPENSE") return `<span class="badge" style="background:#fef2f2;color:#7f1d1d;border:1px solid #fee2e2">Despesa</span>`;
    if (code === "SAVINGS") return `<span class="badge" style="background:#eff6ff;color:#1e3a8a;border:1px solid #dbeafe">Poupança</span>`;
    if (code?.startsWith("TRANSFER")) return `<span class="badge">Transferência</span>`;
    return `<span class="badge">Outro</span>`;
  };
  const statusBadge = (name_pt) => {
    const done = name_pt?.toLowerCase().startsWith("conclu");
    return `<span class="badge" style="${done?'background:#ecfdf5;color:#065f46;border:1px solid #d1fae5':'background:#f1f5f9;color:#334155;border:1px solid #e2e8f0'}">${name_pt||"-"}</span>`;
  };

  async function ensureCategoriesLoaded() {
    if (categoriesMap.size) return;
    const { data, error } = await sb.from("categories").select("id,name,parent_id").order("name");
    if (error) { console.error(error); return; }
    (data||[]).forEach(c => categoriesMap.set(c.id, { name:c.name, parent_id:c.parent_id }));
  }
  function categoryPath(id) {
    if (!id) return "(Sem categoria)";
    const c = categoriesMap.get(id);
    if (!c) return "(Sem categoria)";
    if (!c.parent_id) return c.name;
    const p = categoriesMap.get(c.parent_id);
    return (p?.name ? p.name + " > " : "") + c.name;
  }

  async function fillStatusFilter() {
    const { data, error } = await sb.from("statuses").select("id,name_pt").order("id");
    if (error) { console.error(error); return; }
    dom.fltStatus.innerHTML = `<option value="all">Todos os status</option>` +
      (data||[]).map(s => `<option value="${s.name_pt}">${s.name_pt}</option>`).join("");
  }

  async function fetchPage(reset=false) {
    if (reset) { page = 0; all = []; dom.tbody.innerHTML = ""; }
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let q = sb.from("transactions")
      .select(`
        id, date, amount, signed_amount, description, location, created_at,
        account_id, category_id, status_id, type_id,
        accounts(name),
        transaction_types(code,name_pt),
        statuses(name_pt)
      `)
      .order("date", { ascending:false })
      .order("created_at", { ascending:false })
      .range(from, to);

    const monthVal = dom.fltMonth?.value || null;
    if (monthVal) {
      const [y,m] = monthVal.split("-");
      const start = new Date(+y, +m-1, 1).toISOString().slice(0,10);
      const end   = new Date(+y, +m,   1).toISOString().slice(0,10);
      q = q.gte("date", start).lt("date", end);
    }

    const { data, error } = await q;
    if (error) {
      dom.tbody.innerHTML = `<tr><td colspan="8" style="padding:12px;color:#991b1b">Erro: ${error.message}</td></tr>`;
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
    }));

    all = all.concat(rows);
    page++;
  }

  function render() {
    const q = (dom.fltSearch?.value || "").trim().toLowerCase();
    const t = dom.fltType?.value || "all";
    const s = dom.fltStatus?.value || "all";

    filtered = all.filter(r => {
      const typeOK   = t === "all" || r.type_code === t;
      const statusOK = s === "all" || r.status_name === s;
      const qOK = !q || r.description.toLowerCase().includes(q)
                    || r.category_path.toLowerCase().includes(q)
                    || (r.location||"").toLowerCase().includes(q)
                    || (r.account||"").toLowerCase().includes(q);
      return typeOK && statusOK && qOK;
    });

    if (!filtered.length) {
      dom.tbody.innerHTML = `<tr><td colspan="8" style="padding:12px;color:#475569">Nenhuma transação encontrada</td></tr>`;
      dom.summary.textContent = `Mostrando 0 de ${all.length} transações`;
      return;
    }

    dom.tbody.innerHTML = filtered.map(r => {
      const val = (r.type_code === "EXPENSE") ? -r.amount : r.amount;
      const color = r.type_code === "INCOME" ? "#16a34a" : r.type_code === "EXPENSE" ? "#ef4444" : "#2563eb";
      return `
      <tr class="tx-row" data-id="${r.id}" data-type="${r.type_code||''}" style="cursor:pointer">
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">${ptDate(r.date)}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">${typeBadge(r.type_code)}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb);text-align:right"><span style="color:${color};font-weight:700">${moneyFmt(val)}</span></td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">${r.category_path}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">${r.description || "-"}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)"><span class="badge" style="background:#fff;border:1px solid #e5e7eb">${r.account || "-"}</span></td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">${statusBadge(r.status_name)}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">${r.location || "-"}</td>
      </tr>`;
    }).join("");

    dom.summary.textContent = `Mostrando ${filtered.length} de ${all.length} transações`;
  }

  // --------- Edit modal ---------
  const REF = { accounts:[], regularities:[], methods:[], statuses:[], types:[] };
  function fillSelect(el, rows, label, value="id") {
    if (!el) return;
    el.innerHTML = (rows||[]).map(r => `<option value="${r[value]}">${r[label]}</option>`).join("");
  }
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
  async function loadCategoriesForType(typeCode, selectedId=null) {
    const kind = typeCode === "INCOME" ? "income" : typeCode === "EXPENSE" ? "expense" : typeCode === "SAVINGS" ? "savings" : null;
    if (!kind) { fillSelect(dom.ed.category, [], "label"); return; }
    const { data, error } = await sb.from("categories").select("id,name,parent_id").eq("kind", kind).order("name");
    if (error) { console.error(error); return; }
    const parents = new Map((data||[]).filter(c=>!c.parent_id).map(c=>[c.id,c.name]));
    const seen = new Set(); const rows = [];
    (data||[]).forEach(c => {
      const label = c.parent_id ? `${parents.get(c.parent_id)||""} > ${c.name}` : c.name;
      if (seen.has(label)) return; seen.add(label);
      rows.push({ id:c.id, label });
    });
    fillSelect(dom.ed.category, rows, "label");
    if (selectedId) dom.ed.category.value = selectedId;
  }
  function openModal(){ dom.modal?.removeAttribute("hidden"); }
  function closeModal(){ dom.modal?.setAttribute("hidden",""); }

  async function openEdit(id) {
    try {
      await loadRefs();
      const { data: tx, error } = await sb.from("transactions")
        .select("*, transaction_types(code), categories(kind)")
        .eq("id", id).single();
      if (error) throw error;

      const tcode = tx.transaction_types?.code;

      fillSelect(dom.ed.account, REF.accounts, "name");
      fillSelect(dom.ed.regularity, REF.regularities, "name_pt");
      fillSelect(dom.ed.method, REF.methods, "name_pt");
      fillSelect(dom.ed.status, REF.statuses, "name_pt");
      fillSelect(dom.ed.type, REF.types, "name_pt");

      dom.ed.date.value   = tx.date;
      dom.ed.amount.value = Number(tx.amount || 0).toFixed(2);
      dom.ed.account.value    = tx.account_id || "";
      dom.ed.regularity.value = tx.regularity_id || "";
      dom.ed.method.value     = tx.payment_method_id || "";
      dom.ed.status.value     = tx.status_id || "";
      dom.ed.type.value       = tx.type_id || "";
      dom.ed.desc.value  = tx.description || "";
      dom.ed.loc.value   = tx.location || "";
      dom.ed.notes.value = tx.notes || "";
      dom.ed.nature.value = tx.expense_nature || "";

      await loadCategoriesForType(tcode, tx.category_id || null);

      const isTransfer = tcode && tcode.startsWith("TRANSFER");
      dom.ed.hint.textContent = isTransfer ? "⚠️ Transferência: edição/remoção bloqueadas aqui." : "";
      dom.ed.save.disabled = !!isTransfer;
      dom.ed.del.disabled  = !!isTransfer;

      dom.ed.meta.textContent = `${ptDate(tx.date)} • ${tcode}`;

      dom.ed.save.onclick = async () => {
        try {
          const upd = {
            date: dom.ed.date.value,
            amount: Number(dom.ed.amount.value || 0),
            account_id: dom.ed.account.value || null,
            regularity_id: dom.ed.regularity.value ? Number(dom.ed.regularity.value) : null,
            payment_method_id: dom.ed.method.value ? Number(dom.ed.method.value) : null,
            status_id: dom.ed.status.value ? Number(dom.ed.status.value) : null,
            category_id: dom.ed.category.value || null,
            description: dom.ed.desc.value || null,
            location: dom.ed.loc.value || null,
            notes: dom.ed.notes.value || null,
            expense_nature: (dom.ed.nature.value || null)
          };
          if (!(upd.amount > 0)) throw new Error("Valor inválido.");
          const { error } = await sb.from("transactions").update(upd).eq("id", id);
          if (error) throw error;
          await fetchPage(true);
          render();
          closeModal();
        } catch(e) {
          alert("Erro a guardar: " + (e.message || e));
        }
      };
      dom.ed.del.onclick = async () => {
        if (!confirm("Eliminar este registo?")) return;
        try {
          const { error } = await sb.from("transactions").delete().eq("id", id);
          if (error) throw error;
          await fetchPage(true);
          render();
          closeModal();
        } catch(e) {
          alert("Erro a eliminar: " + (e.message || e));
        }
      };
      dom.ed.cancel.onclick = closeModal;
      dom.modal?.addEventListener("click", (ev)=>{ if (ev.target?.hasAttribute?.("data-close")) closeModal(); });

      openModal();
    } catch (e) {
      console.error(e);
      alert("Não foi possível abrir a edição: " + (e.message || e));
    }
  }

  // --------- Eventos ---------
  dom.btnRefresh?.addEventListener("click", async ()=> { await fetchPage(true); render(); });
  dom.btnMore?.addEventListener("click", async ()=> { await fetchPage(false); render(); });
  dom.fltSearch?.addEventListener("input", render);
  dom.fltType?.addEventListener("change", render);
  dom.fltStatus?.addEventListener("change", async ()=> { await fetchPage(true); render(); });
  dom.fltMonth?.addEventListener("change", async ()=> { await fetchPage(true); render(); });

  dom.tbody?.addEventListener("click", (ev) => {
    const tr = ev.target.closest?.("tr.tx-row");
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
  render();
}