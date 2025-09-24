export async function init() {
  const sb = window.sb;
  const $  = (id) => document.getElementById(id);
  const show = (el, on=true) => el?.classList.toggle("hidden", !on);

  // helpers
  const todayISO = () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); };
  const parseAmount = (s) => Number(String(s||"").replace(",", ".")) || 0;
  const toast = (msg, ok=true) => {
    const box = $("tx-msg"); if (!box) return;
    box.style.display = "block";
    box.style.borderLeft = ok ? "4px solid #16a34a" : "4px solid #ef4444";
    box.textContent = msg;
    setTimeout(()=> box.style.display="none", 2500);
  };

  // defaults
  $("tx-date") && ( $("tx-date").value = todayISO() );

  // carrega referências
  const [accRes, regRes, pmRes, stRes, ttypeRes] = await Promise.all([
    sb.from("accounts").select("id,name").order("name"),
    sb.from("regularities").select("id,name_pt").order("id"),
    sb.from("payment_methods").select("id,name_pt").order("id"),
    sb.from("statuses").select("id,name_pt").order("id"),
    sb.from("transaction_types").select("id,code,name_pt")
  ]);

  if (accRes.error || regRes.error || pmRes.error || stRes.error || ttypeRes.error) {
    console.error(accRes.error || regRes.error || pmRes.error || stRes.error || ttypeRes.error);
    toast("Erro a carregar listas", false);
    return;
  }

  const TYPE_ID = Object.fromEntries((ttypeRes.data||[]).map(t => [t.code, t.id]));

  // ——— contas
  const accounts = accRes.data || [];
  const putPlaceholder = (el, txt="— Sem contas —") => {
    if (!el) return;
    el.innerHTML = `<option value="__none__" selected disabled>${txt}</option>`;
    el.disabled = true;
  };
  const fillOptions = (el, rows, label, value="id") => {
    if (!el) return;
    el.innerHTML = rows.map(r => `<option value="${r[value]}">${r[label]}</option>`).join("");
    el.disabled = false;
  };

  if (accounts.length === 0) {
    toast("Ainda não tens contas. Cria nas Definições.", false);
    putPlaceholder($("tx-account"));
    putPlaceholder($("tx-account-from"));
    putPlaceholder($("tx-account-to"));
    const saveBtn = $("tx-save"); if (saveBtn) { saveBtn.disabled = true; saveBtn.title = "Cria pelo menos uma conta nas Definições."; }
  } else {
    fillOptions($("tx-account"),      accounts, "name");
    fillOptions($("tx-account-from"), accounts, "name");
    fillOptions($("tx-account-to"),   accounts, "name");
    const saveBtn = $("tx-save"); if (saveBtn) { saveBtn.disabled = false; saveBtn.title = ""; }
  }

  // restantes listas
  const fill = (el, rows, label, value="id") => {
    if (!el) return;
    el.innerHTML = (rows||[]).map(r => `<option value="${r[value]}">${r[label]}</option>`).join("");
  };
  fill($("tx-regularity"), regRes.data, "name_pt");
  fill($("tx-method"),     pmRes.data,  "name_pt");
  fill($("tx-status"),     stRes.data,  "name_pt");

  // ——— categorias + natureza default
  const CAT_DEFAULT_NATURE = new Map();

  async function loadCategories(kind) {
    const { data, error } = await sb
      .from("categories")
      .select("id,name,parent_id,expense_nature_default")
      .eq("kind", kind)
      .order("name");

    if (error) { console.error(error); toast("Erro a carregar categorias", false); return; }

    // construir label "Pai > Filho" (quando tiver pai) e evitar duplicados exatos
    const parents = new Map((data||[]).filter(c=>!c.parent_id).map(c=>[c.id,c.name]));
    const seen = new Set(); // dedupe por label (para esconder duplicados da BD, se houver)
    const rows = [];

    (data||[]).forEach(c => {
      const label = c.parent_id ? `${parents.get(c.parent_id)||""} > ${c.name}` : c.name;
      if (seen.has(label)) return; // evita duplicado visual
      seen.add(label);
      CAT_DEFAULT_NATURE.set(c.id, c.expense_nature_default || null);
      rows.push({ id:c.id, label });
    });

    fill($("tx-category"), rows, "label");
  }

  // pré-selecionar Natureza ao escolher categoria (só para despesa)
  $("tx-category")?.addEventListener("change", () => {
    const t = currentType();
    if (t !== "EXPENSE") return;
    const id = $("tx-category").value;
    const def = CAT_DEFAULT_NATURE.get(id);
    const rFixed = document.querySelector('input[name="tx-nature"][value="fixed"]');
    const rVar   = document.querySelector('input[name="tx-nature"][value="variable"]');
    if (!rFixed || !rVar) return;
    if (def === 'fixed')      { rFixed.checked = true;  rVar.checked = false; }
    else if (def === 'variable'){ rFixed.checked = false; rVar.checked = true; }
    else { rFixed.checked = false; rVar.checked = false; }
  });

  // UI por tipo
  const rowAccSingle   = $("row-account-single");
  const rowAccTransfer = $("row-account-transfer");
  const rowCategory    = $("row-category");
  const rowNature      = $("row-nature");
  const currentType = () => document.querySelector('input[name="tx-type"]:checked')?.value || "INCOME";

  async function applyTypeUI() {
    const t = currentType();
    if (t === "TRANSFER") {
      show(rowAccSingle, false); show(rowCategory, false); show(rowAccTransfer, true); show(rowNature, false);
    } else {
      show(rowAccSingle, true);  show(rowCategory, true);  show(rowAccTransfer, false);
      show(rowNature, t === "EXPENSE");
      const map = { INCOME:"income", EXPENSE:"expense", SAVINGS:"savings" };
      await loadCategories(map[t] || "expense");
    }
  }
  document.querySelectorAll('input[name="tx-type"]').forEach(r => r.addEventListener("change", applyTypeUI));
  await loadCategories("income");
  await applyTypeUI();

  // Guardar
  $("tx-save")?.addEventListener("click", async () => {
    try {
      const type   = currentType();
      const date   = $("tx-date")?.value;
      const amount = parseAmount($("tx-amount")?.value);

      if (!date) throw new Error("Escolhe a data.");
      if (!(amount > 0)) throw new Error("Valor inválido.");

      const description = $("tx-desc")?.value || null;
      const location    = $("tx-loc")?.value || null;
      const notes       = $("tx-notes")?.value || null;

      if (type === "TRANSFER") {
        const from_account = $("tx-account-from")?.value;
        const to_account   = $("tx-account-to")?.value;
        if (!from_account || from_account === "__none__" ||
            !to_account   || to_account   === "__none__")
          throw new Error("Seleciona as duas contas da transferência.");
        if (from_account === to_account)
          throw new Error("As contas têm de ser diferentes.");

        const { data:{ user } } = await sb.auth.getUser();
        const { error } = await sb.rpc("create_transfer", {
          p_user_id:       user.id,
          p_from_account:  from_account,
          p_to_account:    to_account,
          p_amount:        amount,
          p_date:          date,
          p_description:   description,
          p_notes:         notes
        });
        if (error) throw error;
        toast("Transferência registada ✅");
      } else {
        const account_id = $("tx-account")?.value;
        if (!account_id || account_id === "__none__")
          throw new Error("Escolhe a conta.");

        const regularity_id     = $("tx-regularity")?.value ? Number($("tx-regularity").value) : null;
        const payment_method_id = $("tx-method")?.value     ? Number($("tx-method").value)     : null;
        const status_id         = $("tx-status")?.value     ? Number($("tx-status").value)     : null;

        const type_id = TYPE_ID[type];
        if (!type_id) throw new Error("Tipo de transação inválido.");

        const { data:{ user } } = await sb.auth.getUser();
        const payload = {
          user_id: user.id,
          type_id,
          regularity_id,
          account_id,
          category_id: $("tx-category")?.value || null,
          payment_method_id,
          status_id,
          date,
          amount,
          description,
          location,
          notes,
          currency: "EUR"
        };

        if (type === "EXPENSE") {
          const chosen = document.querySelector('input[name="tx-nature"]:checked')?.value || null;
          if (chosen) payload.expense_nature = chosen; // senão o trigger herda da categoria
        }

        const { error } = await sb.from("transactions").insert([payload]);
        if (error) throw error;
        toast("Transação registada ✅");
      }

      ["tx-amount","tx-desc","tx-notes"].forEach(id => { const el = $(id); if (el) el.value = ""; });
    } catch (e) {
      console.error(e);
      toast("Erro: " + (e.message || e), false);
    }
  });

  $("tx-clear")?.addEventListener("click", () => {
    ["tx-amount","tx-desc","tx-loc","tx-notes"].forEach(id => { const el=$(id); if (el) el.value=""; });
  });
}
