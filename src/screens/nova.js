// src/screens/nova.js
import { fetchCategoryTree, normalizeKey } from "../lib/categories.js";

export async function init({ sb, outlet } = {}) {
  sb ||= window.sb;

  // ---------- helpers DOM ----------
  const $ = (id) =>
    (outlet && outlet.querySelector(`#${id}`)) || document.getElementById(id);
  const show = (el, on = true) => el?.classList.toggle("hidden", !on);

  // ---------- helpers UI ----------
  const todayISO = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  };
  const parseAmount = (s) => Number(String(s || "").replace(",", ".")) || 0;
  const toast = (msg, ok = true) => {
    const box = $("tx-msg");
    if (!box) return;
    box.style.display = "block";
    box.style.borderLeft = ok ? "4px solid #16a34a" : "4px solid #ef4444";
    box.textContent = msg;
    setTimeout(() => (box.style.display = "none"), 2500);
  };
  $("tx-date") && ($("tx-date").value = todayISO());

  // ==========================================================
  //                     LISTAS BASE
  // ==========================================================
  const [accRes, regRes, pmRes, stRes, ttypeRes] = await Promise.all([
    sb.from("accounts").select("id,name").order("name"),
    sb.from("regularities").select("id,name_pt").order("id"),
    sb.from("payment_methods").select("id,name_pt").order("id"),
    sb.from("statuses").select("id,name_pt").order("id"),
    sb.from("transaction_types").select("id,code,name_pt"),
  ]);
  if (
    accRes.error ||
    regRes.error ||
    pmRes.error ||
    stRes.error ||
    ttypeRes.error
  ) {
    console.error(
      accRes.error ||
        regRes.error ||
        pmRes.error ||
        stRes.error ||
        ttypeRes.error
    );
    toast("Erro a carregar listas", false);
    return;
  }

  const TYPE_ID = Object.fromEntries(
    (ttypeRes.data || []).map((t) => [t.code, t.id])
  );

  // ---------- contas ----------
  const putPlaceholder = (el, txt = "— Sem contas —") => {
    if (!el) return;
    el.innerHTML = `<option value="__none__" selected disabled>${txt}</option>`;
    el.disabled = true;
  };
  const fillOptions = (el, rows, label, value = "id") => {
    if (!el) return;
    el.innerHTML = (rows || [])
      .map((r) => `<option value="${r[value]}">${r[label]}</option>`)
      .join("");
    el.disabled = false;
  };

  async function loadAccountsIntoDropdowns() {
    const { data: accounts, error } = await sb
      .from("accounts")
      .select("id,name")
      .order("name");
    if (error) {
      console.error(error);
      putPlaceholder($("tx-account"));
      putPlaceholder($("tx-account-from"));
      putPlaceholder($("tx-account-to"));
      return;
    }
    if (!accounts?.length) {
      toast("Ainda não tens contas. Cria nas Definições.", false);
      putPlaceholder($("tx-account"));
      putPlaceholder($("tx-account-from"));
      putPlaceholder($("tx-account-to"));
      $("tx-save") &&
        (($("tx-save").disabled = true),
        ($("tx-save").title = "Cria pelo menos uma conta nas Definições."));
      return;
    }
    fillOptions($("tx-account"), accounts, "name");
    fillOptions($("tx-account-from"), accounts, "name");
    fillOptions($("tx-account-to"), accounts, "name");
    if ($("tx-save")) {
      $("tx-save").disabled = false;
      $("tx-save").title = "";
    }
  }
  await loadAccountsIntoDropdowns();

  // ---------- restantes listas ----------
  const fill = (el, rows, label, value = "id") => {
    if (!el) return;
    el.innerHTML = (rows || [])
      .map((r) => `<option value="${r[value]}">${r[label]}</option>`)
      .join("");
  };
  fill($("tx-regularity"), regRes.data, "name_pt");
  fill($("tx-method"), pmRes.data, "name_pt");
  fill($("tx-status"), stRes.data, "name_pt");

  // ==========================================================
  //                     CATEGORIAS
  // ==========================================================
  const _collPT = new Intl.Collator("pt-PT", { sensitivity: "base" });
  const CAT_DEFAULT_NATURE = new Map(); // category_id -> 'fixed'|'variable'|null
  let _CAT_TREE = null; // cache

  function clearCatNatureRadios() {
    const rFixed = document.querySelector(
      'input[name="tx-nature"][value="fixed"]'
    );
    const rVar = document.querySelector(
      'input[name="tx-nature"][value="variable"]'
    );
    if (rFixed && rVar) {
      rFixed.checked = false;
      rVar.checked = false;
    }
  }

  async function loadExpenseTree() {
    if (_CAT_TREE) return _CAT_TREE;
    const { parents, children } = await fetchCategoryTree(sb); // lida com globais + do utilizador
    // preencher mapa de natureza por categoria (se a tua lib não trouxer nature, ignora)
    try {
      const { data } = await sb
        .from("categories")
        .select("id,nature")
        .neq("parent_id", null);
      (data || []).forEach((c) =>
        CAT_DEFAULT_NATURE.set(c.id, c.nature || null)
      );
    } catch {}
    _CAT_TREE = { parents, children };
    return _CAT_TREE;
  }

  function fillSelect(
    el,
    items,
    { placeholder = "— escolher —", useValue = "id", useLabel = "name" } = {}
  ) {
    if (!el) return;
    el.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = placeholder;
    el.appendChild(ph);
    (items || []).forEach((it) => {
      const o = document.createElement("option");
      o.value = it[useValue];
      o.textContent = it[useLabel];
      el.appendChild(o);
    });
  }

  // 2-selects para DESPESA (pai + filho)
  async function bindExpenseDropdowns({ parentEl, childEl, hiddenEl }) {
    const { parents, children } = await loadExpenseTree();
    // pais ordenados
    const parentsSorted = [...parents].sort((a, b) =>
      _collPT.compare(a.name, b.name)
    );
    fillSelect(parentEl, parentsSorted, {
      placeholder: "Categoria (ex.: Casa)",
    });
    fillSelect(childEl, [], { placeholder: "Subcategoria" });

    parentEl.onchange = () => {
      const key = normalizeKey(parentEl.value);
      const parentIds = parents
        .filter((p) => normalizeKey(p.name) === key)
        .map((p) => p.id);
      const subs = children
        .filter((c) => parentIds.includes(c.parent_id))
        .sort((a, b) => _collPT.compare(a.name, b.name));
      fillSelect(childEl, subs, { placeholder: "Subcategoria" });
      hiddenEl.value = "";
      clearCatNatureRadios();
    };

    childEl.onchange = () => {
      hiddenEl.value = childEl.value || "";
      const def = CAT_DEFAULT_NATURE.get(childEl.value) || null;
      const rFixed = document.querySelector(
        'input[name="tx-nature"][value="fixed"]'
      );
      const rVar = document.querySelector(
        'input[name="tx-nature"][value="variable"]'
      );
      if (rFixed && rVar) {
        rFixed.checked = def === "fixed";
        rVar.checked = def === "variable";
      }
    };

    // start
    parentEl.dispatchEvent(new Event("change"));
  }

  // lista plana para Receita/Poupança (um select)
  async function loadPlainCategories(kind /* 'income' | 'savings' */) {
    const { data, error } = await sb
      .from("categories")
      .select("id,name,parent_id")
      .eq("kind", kind);
    if (error) {
      console.error(error);
      toast("Erro a carregar categorias", false);
      return;
    }
    const parents = new Map(
      (data || []).filter((c) => !c.parent_id).map((c) => [c.id, c.name])
    );
    const rows = (data || [])
      .map((c) => ({
        id: c.id,
        label: c.parent_id
          ? `${parents.get(c.parent_id) || ""} > ${c.name}`
          : c.name,
      }))
      .sort((a, b) => _collPT.compare(a.label, b.label));
    fill($("tx-category"), rows, "label"); // select “antigo”
  }

  // ==========================================================
  //                     UI POR TIPO
  // ==========================================================
  const rowAccSingle = $("row-account-single");
  const rowAccTransfer = $("row-account-transfer");
  const rowCategory = $("row-category");
  const rowNature = $("row-nature");
  const wrapExpense = $("exp-cat-wrap");
  const selectLegacy = $("tx-category"); // usado para INCOME / SAVINGS
  const parentEl = $("cat-parent");
  const childEl = $("cat-child");
  const hiddenEl = $("tx-category-exp");

  const currentType = () => {
    const raw = (
      document.querySelector('input[name="tx-type"]:checked')?.value || "INCOME"
    )
      .toString()
      .toUpperCase();
    if (raw.startsWith("DESP")) return "EXPENSE";
    if (raw.startsWith("REC") || raw.startsWith("REN")) return "INCOME";
    if (raw.startsWith("POUP")) return "SAVINGS";
    if (raw.startsWith("TRANS")) return "TRANSFER";
    return raw; // já pode vir como INCOME/EXPENSE/SAVINGS/TRANSFER
  };

  async function applyTypeUI() {
    const t = currentType();

    if (t === "TRANSFER") {
      [rowAccSingle, rowCategory, rowNature].forEach((el) => show(el, false));
      show(rowAccTransfer, true);
      return;
    }

    show(rowAccSingle, true);
    show(rowAccTransfer, false);
    show(rowCategory, true);
    show(rowNature, t === "EXPENSE");

    if (t !== "EXPENSE") {
      // Receita / Poupança → 1 select
      show(wrapExpense, false);
      selectLegacy?.classList.remove("hidden");
      await loadPlainCategories(t === "INCOME" ? "income" : "savings");
      return;
    }

    // Despesa → 2 selects
    if (!wrapExpense || !parentEl || !childEl || !hiddenEl) {
      console.warn(
        "IDs em falta (exp-cat-wrap/cat-parent/cat-child/tx-category-exp). A usar fallback 1-select."
      );
      selectLegacy?.classList.remove("hidden");
      await loadPlainCategories("expense");
      return;
    }
    show(wrapExpense, true);
    selectLegacy?.classList.add("hidden");

    // ligar dropdowns (apenas 1x por sessão)
    if (!parentEl.dataset.bound) {
      await bindExpenseDropdowns({ parentEl, childEl, hiddenEl });
      parentEl.dataset.bound = "1";
    } else {
      // se já estavam ligados, apenas re-dispensar change para refazer subcategorias
      parentEl.dispatchEvent(new Event("change"));
    }
  }

  document
    .querySelectorAll('input[name="tx-type"]')
    .forEach((r) => r.addEventListener("change", applyTypeUI));
  await applyTypeUI();

  // Quando houver alterações noutros ecrãs:
  window.addEventListener("categories:changed", async () => {
    _CAT_TREE = null; // invalida cache local
    CAT_DEFAULT_NATURE.clear();
    await applyTypeUI(); // reconstroi UI atual
  });
  window.addEventListener("accounts:changed", loadAccountsIntoDropdowns);

  // ==========================================================
  //                     GUARDAR
  // ==========================================================
  $("tx-save")?.addEventListener("click", async () => {
    try {
      const type = currentType();
      const date = $("tx-date")?.value;
      const amount = parseAmount($("tx-amount")?.value);

      if (!date) throw new Error("Escolhe a data.");
      if (!(amount > 0)) throw new Error("Valor inválido.");

      const description = $("tx-desc")?.value || null;
      const location = $("tx-loc")?.value || null;
      const notes = $("tx-notes")?.value || null;

      if (type === "TRANSFER") {
        const from_account = $("tx-account-from")?.value;
        const to_account = $("tx-account-to")?.value;
        if (
          !from_account ||
          from_account === "__none__" ||
          !to_account ||
          to_account === "__none__"
        )
          throw new Error("Seleciona as duas contas da transferência.");
        if (from_account === to_account)
          throw new Error("As contas têm de ser diferentes.");

        // RPC no lado do servidor usa auth.uid() (não envies p_user_id)
        const { error } = await sb.rpc("create_transfer", {
          p_from_account: from_account,
          p_to_account: to_account,
          p_amount: amount,
          p_date: date,
          p_description: description,
          p_notes: notes,
        });
        if (error) throw error;
        toast("Transferência registada ✅");
        ["tx-amount", "tx-desc", "tx-notes"].forEach(
          (id) => $(id) && ($(id).value = "")
        );
        return;
      }

      // INCOME / EXPENSE / SAVINGS
      const account_id = $("tx-account")?.value;
      if (!account_id || account_id === "__none__")
        throw new Error("Escolhe a conta.");

      const regularity_id = $("tx-regularity")?.value
        ? Number($("tx-regularity").value)
        : null;
      const payment_method_id = $("tx-method")?.value
        ? Number($("tx-method").value)
        : null;
      const status_id = $("tx-status")?.value
        ? Number($("tx-status").value)
        : null;

      const type_id = TYPE_ID[type];
      if (!type_id) throw new Error("Tipo de transação inválido.");

      const {
        data: { user },
      } = await sb.auth.getUser();

      const category_id =
        type === "EXPENSE"
          ? $("tx-category-exp")?.value || null
          : $("tx-category")?.value || null;

      const payload = {
        user_id: user.id,
        type_id,
        regularity_id,
        account_id,
        category_id,
        payment_method_id,
        status_id,
        date,
        amount,
        description,
        location,
        notes,
        currency: "EUR",
      };

      if (type === "EXPENSE") {
        const chosen =
          document.querySelector('input[name="tx-nature"]:checked')?.value ||
          null;
        if (chosen) payload.expense_nature = chosen; // senão herda da categoria
      }

      const { error } = await sb.from("transactions").insert([payload]);
      if (error) throw error;
      toast("Transação registada ✅");
      ["tx-amount", "tx-desc", "tx-notes"].forEach(
        (id) => $(id) && ($(id).value = "")
      );
    } catch (e) {
      console.error(e);
      toast("Erro: " + (e.message || e), false);
    }
  });

  $("tx-clear")?.addEventListener("click", () => {
    ["tx-amount", "tx-desc", "tx-loc", "tx-notes"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
  });
}
