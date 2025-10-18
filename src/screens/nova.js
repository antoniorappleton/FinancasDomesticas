// src/screens/nova.js
export async function init({ outlet } = {}) {
  const sb = window.sb;
  const $ = (id) =>
    (outlet && outlet.querySelector(`#${id}`)) || document.getElementById(id);
  const show = (el, on = true) => el?.classList.toggle("hidden", !on);

  // ----- helpers -----
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

  // ----- carregar listas base -----
  const [accRes, regRes, pmRes, stRes, ttRes] = await Promise.all([
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
    ttRes.error
  ) {
    console.error(
      accRes.error || regRes.error || pmRes.error || stRes.error || ttRes.error
    );
    toast("Erro a carregar listas", false);
    return;
  }
  const TYPE_ID = Object.fromEntries(
    (ttRes.data || []).map((t) => [t.code, t.id])
  );

  const fill = (el, rows, label, value = "id") => {
    if (!el) return;
    el.innerHTML = (rows || [])
      .map((r) => `<option value="${r[value]}">${r[label]}</option>`)
      .join("");
  };
  const putPlaceholder = (el, txt = "— Sem contas —") => {
    if (!el) return;
    el.innerHTML = `<option value="__none__" disabled selected>${txt}</option>`;
    el.disabled = true;
  };

  // contas
  async function loadAccounts() {
    const { data, error } = await sb
      .from("accounts")
      .select("id,name")
      .order("name");
    if (error || !data?.length) {
      putPlaceholder($("tx-account"));
      putPlaceholder($("tx-account-from"));
      putPlaceholder($("tx-account-to"));
      $("tx-save") &&
        (($("tx-save").disabled = true),
        ($("tx-save").title = "Cria pelo menos uma conta nas Definições."));
      return;
    }
    fill($("tx-account"), data, "name");
    fill($("tx-account-from"), data, "name");
    fill($("tx-account-to"), data, "name");
    if ($("tx-save")) {
      $("tx-save").disabled = false;
      $("tx-save").title = "";
    }
  }
  await loadAccounts();

  // outros selects
  fill($("tx-regularity"), regRes.data, "name_pt");
  fill($("tx-method"), pmRes.data, "name_pt");
  fill($("tx-status"), stRes.data, "name_pt");

  // ----- categorias -----
  const coll = new Intl.Collator("pt-PT", { sensitivity: "base" });

  async function loadPlainCategories(kind) {
    const { data, error } = await sb
      .from("categories")
      .select("id,name,parent_id")
      .eq("kind", kind)
      .order("name");
    if (error) {
      console.error(error);
      toast("Erro a carregar categorias", false);
      return;
    }
    if (!data?.length) {
      $("tx-category").innerHTML = `<option value="">(sem categorias)</option>`;
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
      .sort((a, b) => coll.compare(a.label, b.label));
    $("tx-category").innerHTML = rows
      .map((r) => `<option value="${r.id}">${r.label}</option>`)
      .join("");
  }

  async function bindExpenseDropdowns() {
    // ⚠️ Para NULL em Supabase/PostgREST, usar .is('col', null) — NÃO .eq('col', null)
    const { data: parents, error: e1 } = await sb
      .from("categories")
      .select("id,name")
      .is("parent_id", null)
      .eq("kind", "expense")
      .order("name");
    if (e1) {
      console.error(e1);
      toast("Erro a carregar categorias", false);
      return;
    }

    const pSorted = (parents || []).sort((a, b) =>
      coll.compare(a.name, b.name)
    );
    $("cat-parent").innerHTML =
      `<option value="">Categoria (ex.: Casa)</option>` +
      pSorted.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");

    $("cat-child").innerHTML = `<option value="">Subcategoria</option>`;

    $("cat-parent").onchange = async () => {
      const pid = $("cat-parent").value;
      $("tx-category-exp").value = "";
      if (!pid) {
        $("cat-child").innerHTML = `<option value="">Subcategoria</option>`;
        return;
      }
      const { data: subs, error: e2 } = await sb
        .from("categories")
        .select("id,name")
        .eq("parent_id", pid)
        .eq("kind", "expense")
        .order("name");
      if (e2) {
        console.error(e2);
        toast("Erro a carregar subcategorias", false);
        return;
      }
      const sSorted = (subs || []).sort((a, b) => coll.compare(a.name, b.name));
      $("cat-child").innerHTML =
        `<option value="">Subcategoria</option>` +
        sSorted
          .map((s) => `<option value="${s.id}">${s.name}</option>`)
          .join("");
    };
    $("cat-child").onchange = () => {
      $("tx-category-exp").value = $("cat-child").value || "";
    };

    // start
    $("cat-parent").dispatchEvent(new Event("change"));
  }

  // ----- UI por tipo -----
  const rowAccSingle = $("row-account-single");
  const rowAccTransfer = $("row-account-transfer");
  const rowCategory = $("row-category");
  const rowNature = $("row-nature");
  const wrapExpense = $("exp-cat-wrap");
  const selectLegacy = $("tx-category");

  const currentType = () =>
    (
      document.querySelector('input[name="tx-type"]:checked')?.value || "INCOME"
    ).toUpperCase();

  async function applyTypeUI() {
    const t = currentType();

    if (t === "TRANSFER") {
      show(rowAccSingle, false);
      show(rowAccTransfer, true);
      show(rowCategory, false);
      show(rowNature, false);
      return;
    }

    show(rowAccSingle, true);
    show(rowAccTransfer, false);
    show(rowCategory, true);
    show(rowNature, t === "EXPENSE");

    if (t !== "EXPENSE") {
      // Receita / Poupança → select plano (inclui sistema + tuas)
      show(wrapExpense, false);
      selectLegacy?.classList.remove("hidden");
      await loadPlainCategories(t === "INCOME" ? "income" : "savings");
      return;
    }

    // Despesa → 2 selects (pais = parent_id IS NULL)
    selectLegacy?.classList.add("hidden");
    show(wrapExpense, true);
    if (!wrapExpense.dataset.bound) {
      await bindExpenseDropdowns();
      wrapExpense.dataset.bound = "1";
    } else {
      $("cat-parent")?.dispatchEvent(new Event("change"));
    }
  }

  document
    .querySelectorAll('input[name="tx-type"]')
    .forEach((r) => r.addEventListener("change", applyTypeUI));
  await applyTypeUI();

  // ----- guardar -----
  $("tx-save")?.addEventListener("click", async () => {
    try {
      const t = currentType();
      const date = $("tx-date")?.value;
      const amount = parseAmount($("tx-amount")?.value);
      if (!date) throw new Error("Escolhe a data.");
      if (!(amount > 0)) throw new Error("Valor inválido.");

      const description = $("tx-desc")?.value || null;
      const location = $("tx-loc")?.value || null;
      const notes = $("tx-notes")?.value || null;

      if (t === "TRANSFER") {
        const from_account = $("tx-account-from")?.value;
        const to_account = $("tx-account-to")?.value;
        if (
          !from_account ||
          from_account === "__none__" ||
          !to_account ||
          to_account === "__none__"
        )
          throw new Error("Seleciona as duas contas.");
        if (from_account === to_account)
          throw new Error("As contas têm de ser diferentes.");

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

      // income / expense / savings
      const account_id = $("tx-account")?.value;
      if (!account_id || account_id === "__none__")
        throw new Error("Escolhe a conta.");

      const {
        data: { user },
      } = await sb.auth.getUser();
      const type_id = TYPE_ID[t];
      if (!type_id) throw new Error("Tipo inválido.");

      const regularity_id = $("tx-regularity")?.value
        ? Number($("tx-regularity").value)
        : null;
      const payment_method_id = $("tx-method")?.value
        ? Number($("tx-method").value)
        : null;
      const status_id = $("tx-status")?.value
        ? Number($("tx-status").value)
        : null;

      const category_id =
        t === "EXPENSE"
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

      if (t === "EXPENSE") {
        const chosen =
          document.querySelector('input[name="tx-nature"]:checked')?.value ||
          null;
        if (chosen) payload.expense_nature = chosen;
      }

      const { error } = await sb.from("transactions").insert([payload]);
      if (error) throw error;

      toast("Transação registada ✅");
      ["tx-amount", "tx-desc", "tx-loc", "tx-notes"].forEach(
        (id) => $(id) && ($(id).value = "")
      );
    } catch (e) {
      console.error(e);
      toast("Erro: " + (e.message || e), false);
    }
  });

  $("tx-clear")?.addEventListener("click", () => {
    ["tx-amount", "tx-desc", "tx-loc", "tx-notes"].forEach(
      (id) => $(id) && ($(id).value = "")
    );
  });

  // ----- popup informações do screen -----
  // --- Ajuda do ecrã (Dashboard) ---
  (function mountHelpForDashboard() {
    // cria botão se não existir
    let btn = document.getElementById("help-fab");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "help-fab";
      btn.className = "help-fab";
      btn.title = "Ajuda deste ecrã";
      btn.innerHTML = `<svg aria-hidden="true"><use href="#i-info"></use></svg>`;
      document.body.appendChild(btn);
    }

    // cria popup se não existir
    let pop = document.getElementById("help-pop");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "help-pop";
      pop.className = "help-pop hidden";
      document.body.appendChild(pop);
    }

    // conteúdo específico do Dashboard
    pop.innerHTML = `
    <h3>O que mostra este ecrã?</h3>
    <p>· Neste Screen pode adicionar as suas despesas, receitas, poupanças ou transferências. </p>
    <p>· Para novas categorias, pode criar as suas personalizadas no screen Definições</p>
    <button class="close" type="button">Fechar</button>
  `;

    // liga eventos (uma vez)
    btn.onclick = () => pop.classList.toggle("hidden");
    pop
      .querySelector(".close")
      ?.addEventListener("click", () => pop.classList.add("hidden"));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") pop.classList.add("hidden");
    });
  })();
}
