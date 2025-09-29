export async function init() {
  const sb = window.sb;
  const $ = (id) => document.getElementById(id);
  const show = (el, on = true) => el?.classList.toggle("hidden", !on);

  // ============ helpers ============
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

  // ============ carrega listas base ============
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

  // ---- contas
  const accounts = accRes.data || [];
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

  if (accounts.length === 0) {
    toast("Ainda não tens contas. Cria nas Definições.", false);
    putPlaceholder($("tx-account"));
    putPlaceholder($("tx-account-from"));
    putPlaceholder($("tx-account-to"));
    const saveBtn = $("tx-save");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.title = "Cria pelo menos uma conta nas Definições.";
    }
  } else {
    fillOptions($("tx-account"), accounts, "name");
    fillOptions($("tx-account-from"), accounts, "name");
    fillOptions($("tx-account-to"), accounts, "name");
    const saveBtn = $("tx-save");
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.title = "";
    }
  }

  // restantes listas
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
  //               CATEGORIAS — UI DEPENDENTE (DESPESA)
  // ==========================================================
  const _collPT = new Intl.Collator("pt-PT", { sensitivity: "base" });
  const PREFERRED_ORDER = [
    "Alimentação",
    "Lazer e Entretenimento",
    "Outros",
    "Outras Despesas",
    "Casa",
    "Carros",
    "Saúde",
  ];
  const CAT_DEFAULT_NATURE = new Map(); // category_id -> 'fixed'|'variable'|null
  let _CAT_TREE = null; // {parents, children}

  async function loadExpenseCategoryTree() {
    // kind='expense' e traz também nature para pre-selecionar
    if (_CAT_TREE) return _CAT_TREE;
    const { data, error } = await sb
      .from("categories")
      .select("id,name,parent_id,kind,nature")
      .eq("kind", "expense");
    if (error) {
      console.error(error);
      toast("Erro a carregar categorias", false);
      return { parents: [], children: [] };
    }

    const parents = (data || []).filter((c) => !c.parent_id);
    const children = (data || []).filter((c) => c.parent_id);

    // ordem dos pais: preferidos → A–Z
    const rank = new Map(PREFERRED_ORDER.map((n, i) => [n.toLowerCase(), i]));
    parents.sort((a, b) => {
      const ra = rank.has(a.name.toLowerCase())
        ? rank.get(a.name.toLowerCase())
        : 9999;
      const rb = rank.has(b.name.toLowerCase())
        ? rank.get(b.name.toLowerCase())
        : 9999;
      return ra !== rb ? ra - rb : _collPT.compare(a.name, b.name);
    });
    children.sort((a, b) => _collPT.compare(a.name, b.name));

    // nature por id
    (data || []).forEach((c) => CAT_DEFAULT_NATURE.set(c.id, c.nature || null));

    _CAT_TREE = { parents, children };
    return _CAT_TREE;
  }

  function fillSelect(el, items, { placeholder = "— escolher —" } = {}) {
    if (!el) return;
    el.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = placeholder;
    el.appendChild(ph);
    items.forEach((it) => {
      const o = document.createElement("option");
      o.value = it.id;
      o.textContent = it.name;
      el.appendChild(o);
    });
  }

  async function bindExpenseCategoryDropdowns({
    parentEl,
    childEl,
    hiddenEl,
    currentCategoryId = null,
  }) {
    if (!parentEl || !childEl || !hiddenEl) return;
    const { parents, children } = await loadExpenseCategoryTree();

    fillSelect(parentEl, parents, { placeholder: "Categoria (ex.: Casa)" });
    fillSelect(childEl, [], { placeholder: "Subcategoria" });

    parentEl.addEventListener("change", () => {
      const pid = parentEl.value || null;
      const subs = pid ? children.filter((c) => c.parent_id === pid) : [];
      fillSelect(childEl, subs, { placeholder: "Subcategoria" });
      hiddenEl.value = "";
      // limpar natureza enquanto não houver sub
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
    });

    childEl.addEventListener("change", () => {
      hiddenEl.value = childEl.value || "";

      // preseleciona Natureza (se houver)
      const def = CAT_DEFAULT_NATURE.get(childEl.value) || null;
      const rFixed = document.querySelector(
        'input[name="tx-nature"][value="fixed"]'
      );
      const rVar = document.querySelector(
        'input[name="tx-nature"][value="variable"]'
      );
      if (rFixed && rVar) {
        if (def === "fixed") {
          rFixed.checked = true;
          rVar.checked = false;
        } else if (def === "variable") {
          rFixed.checked = false;
          rVar.checked = true;
        } else {
          rFixed.checked = false;
          rVar.checked = false;
        }
      }
    });

    // preselect quando a edição já traz category_id
    if (currentCategoryId) {
      const child = children.find((c) => c.id === currentCategoryId);
      if (child) {
        parentEl.value = child.parent_id || "";
        parentEl.dispatchEvent(new Event("change"));
        setTimeout(() => {
          childEl.value = currentCategoryId;
          hiddenEl.value = currentCategoryId;
          childEl.dispatchEvent(new Event("change"));
        }, 0);
      } else {
        const parent = parents.find((p) => p.id === currentCategoryId);
        if (parent) {
          parentEl.value = parent.id;
          parentEl.dispatchEvent(new Event("change"));
          hiddenEl.value = parent.id;
        }
      }
    }
  }

  // ========= categorias simples para Receitas/Poupanças (1 select) =========
  async function loadPlainCategories(kind) {
    // Produz labels "Pai > Filho" quando existir pai
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

    fill($("tx-category"), rows, "label"); // este select é usado só para INCOME/SAVINGS
  }

  // ============ UI por tipo ============
  const rowAccSingle = $("row-account-single");
  const rowAccTransfer = $("row-account-transfer");
  const rowCategory = $("row-category");
  const rowNature = $("row-nature");
  
  function currentType() {
    const raw = (
      document.querySelector('input[name="tx-type"]:checked')?.value || "INCOME"
    )
      .toString()
      .toUpperCase();
    if (raw.startsWith("DESP")) return "EXPENSE"; // Despesa
    if (raw.startsWith("REC") || raw.startsWith("REN")) return "INCOME"; // Receita
    if (raw.startsWith("POUP")) return "SAVINGS"; // Poupança
    if (raw.startsWith("TRANS")) return "TRANSFER"; // Transferência
    return raw; // já pode ser INCOME/EXPENSE/SAVINGS/TRANSFER
  }

  async function applyTypeUI() {
    const t = currentType();

    // linhas
    const rowAccSingle = $("row-account-single");
    const rowAccTransfer = $("row-account-transfer");
    const rowCategory = $("row-category");
    const rowNature = $("row-nature");

    if (t === "TRANSFER") {
      [rowAccSingle, rowCategory, rowNature].forEach((el) => show(el, false));
      show(rowAccTransfer, true);
      return;
    }

    show(rowAccSingle, true);
    show(rowAccTransfer, false);
    show(rowCategory, true);
    show(rowNature, t === "EXPENSE");

    const wrap = $("exp-cat-wrap");
    const selectLegacy = $("tx-category"); // 1-select
    const parentEl = $("cat-parent");
    const childEl = $("cat-child");
    const hiddenEl = $("tx-category-exp");

    // helper de fallback para select antigo
    const useLegacy = async (kind) => {
      show(wrap, false);
      selectLegacy?.classList.remove("hidden");
      await loadPlainCategories(kind);
    };

    if (t !== "EXPENSE") {
      // RECEITA / POUPANÇA
      await useLegacy(t === "INCOME" ? "income" : "savings");
      return;
    }

    // DESPESA
    if (!wrap || !parentEl || !childEl || !hiddenEl) {
      console.warn(
        "IDs em falta (exp-cat-wrap/cat-parent/cat-child/tx-category-exp). A usar fallback 1-select."
      );
      await useLegacy("expense");
      return;
    }

    // mostra o bloco novo e esconde o antigo
    show(wrap, true);
    selectLegacy?.classList.add("hidden");

    try {
      // só liga uma vez por sessão
      if (!parentEl.dataset.bound) {
        await bindExpenseCategoryDropdowns({ parentEl, childEl, hiddenEl });
        parentEl.dataset.bound = "1";
      }
    } catch (err) {
      console.error("Falha a ligar dropdowns de despesa:", err);
      await useLegacy("expense");
    }
  }


  document
    .querySelectorAll('input[name="tx-type"]')
    .forEach((r) => r.addEventListener("change", applyTypeUI));
  await applyTypeUI(); // arranque

  // ============ Guardar ============
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

        // A tua função SQL não aceita p_user_id — usa auth.uid() no servidor
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
      } else {
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
          if (chosen) payload.expense_nature = chosen; // senão herda da categoria (trigger/relatório)
        }

        const { error } = await sb.from("transactions").insert([payload]);
        if (error) throw error;
        toast("Transação registada ✅");
      }

      ["tx-amount", "tx-desc", "tx-notes"].forEach((id) => {
        const el = $(id);
        if (el) el.value = "";
      });
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

  document
    .querySelectorAll('input[name="tx-type"]')
    .forEach((r) => r.addEventListener("change", applyTypeUI));
  await applyTypeUI();


}
