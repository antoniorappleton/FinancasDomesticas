// src/screens/objetivos.js
export async function init({ sb, outlet } = {}) {
  sb ||= window.sb;
  const $ = (sel) =>
    (outlet && outlet.querySelector(sel)) || document.querySelector(sel);

  // ===================== Helpers =========================
  const money = (n) =>
    "€ " +
    Number(n || 0).toLocaleString("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const show = (el, v = true) => el && (el.hidden = !v);
  const toggle = (el, v) => el && el.classList.toggle("hidden", !v);

  // devolve [startISO, endISO) com base no mês da data-limite (YYYY-MM-DD) ou mês atual
  function monthWindowFromDeadline(deadlineISO) {
    const base = deadlineISO ? new Date(deadlineISO) : new Date();
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    return [ymd(start), ymd(end)];
  }

  // =================== Dados base (cache) =================
  let EXPENSE_TYPE_ID = null;
  async function getExpenseTypeId() {
    if (EXPENSE_TYPE_ID) return EXPENSE_TYPE_ID;
    const { data, error } = await sb
      .from("transaction_types")
      .select("id")
      .eq("code", "EXPENSE")
      .single();
    if (error) throw error;
    EXPENSE_TYPE_ID = data.id;
    return EXPENSE_TYPE_ID;
  }

  // devolve um Set com id da categoria alvo + todas as suas descendentes (tuas + globais)
  let _catsCache = null;
  async function getCategoryAndDescendants(targetId) {
    if (!targetId) return new Set(); // objetivo pode não ter categoria
    if (!_catsCache) {
      const uid = (await sb.auth.getUser()).data?.user?.id;
      const { data, error } = await sb
        .from("categories")
        .select("id,parent_id,user_id");
      if (error) throw error;
      // considerar globais (user_id null) e do utilizador
      _catsCache = (data || []).filter(
        (c) => c.user_id === uid || c.user_id === null
      );
    }
    const byParent = new Map();
    for (const c of _catsCache) {
      const arr = byParent.get(c.parent_id) || [];
      arr.push(c);
      byParent.set(c.parent_id, arr);
    }
    const out = new Set([targetId]);
    const stack = [targetId];
    while (stack.length) {
      const id = stack.pop();
      for (const child of byParent.get(id) || []) {
        if (!out.has(child.id)) {
          out.add(child.id);
          stack.push(child.id);
        }
      }
    }
    return out;
  }

  // tenta view agregada; se não existir, soma direto em transactions
  async function computeSpentForGoal(goal) {
    const [fromISO, toISO] = monthWindowFromDeadline(goal.due_date);
    const typeId = await getExpenseTypeId();

    // 1) tenta view v_user_monthly_expenses (se existir)
    try {
      // algumas instalações chamam coluna 'ym' (YYYY-MM). Build rápido:
      const ym = fromISO.slice(0, 7);
      const { data, error } = await sb
        .from("v_user_monthly_expenses")
        .select("category_id,total,ym")
        .eq("ym", ym);
      if (!error && Array.isArray(data)) {
        if (!goal.category_id) return 0;
        // se a view não inclui descendentes, fazemos nós:
        const ids = await getCategoryAndDescendants(goal.category_id);
        return (data || [])
          .filter((r) => ids.has(r.category_id))
          .reduce((a, r) => a + Number(r.total || 0), 0);
      }
    } catch {
      /* sem view, seguimos para 2) */
    }

    // 2) soma direta a partir de transactions (com range e descendentes)
    const ids = goal.category_id
      ? Array.from(await getCategoryAndDescendants(goal.category_id))
      : null;

    let q = sb
      .from("transactions")
      .select("amount, category_id, type_id, date")
      .eq("type_id", typeId)
      .gte("date", fromISO)
      .lt("date", toISO);

    if (ids && ids.length) q = q.in("category_id", ids);

    const { data: txs, error: e2 } = await q;
    if (e2) throw e2;

    return (txs || []).reduce((a, r) => a + Number(r.amount || 0), 0);
  }

  // ===================== UI: selects ======================
  async function loadCategories(selectEls) {
    const { data, error } = await sb
      .from("categories")
      .select("id,name,parent_id")
      .order("name", { ascending: true });
    if (error) return;
    const opts =
      '<option value="">(sem categoria)</option>' +
      (data || [])
        .map((c) => `<option value="${c.id}">${c.name}</option>`)
        .join("");
    (selectEls || []).forEach((sel) => sel && (sel.innerHTML = opts));
  }

  // =================== Form criar =========================
  function refreshCreateForm() {
    const t = $("#obj-type")?.value || "budget_cap";
    toggle($("#obj-cat-wrap"), t === "budget_cap");
    toggle($("#obj-cap-wrap"), t === "budget_cap");
    toggle($("#obj-target-wrap"), t === "savings_goal");
  }
  $("#obj-type")?.addEventListener("change", refreshCreateForm);

  $("#obj-save")?.addEventListener("click", async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return alert("Sessão expirada.");

    const title = $("#obj-title")?.value?.trim();
    const type = $("#obj-type")?.value || "budget_cap";

    const category_id = $("#obj-category")?.value || null;
    const monthly_cap = $("#obj-monthly-cap")?.value
      ? Number($("#obj-monthly-cap").value)
      : null;
    const target_amount = $("#obj-target")?.value
      ? Number($("#obj-target").value)
      : null;
    const due_date = $("#obj-due")?.value || null;
    const notes = $("#obj-notes")?.value || null;

    if (!title) return alert("Indica um título.");
    if (type === "budget_cap" && (!monthly_cap || monthly_cap <= 0))
      return alert("Define o teto mensal (€).");
    if (type === "savings_goal" && (!target_amount || target_amount <= 0))
      return alert("Define a meta (€).");

    const { error } = await sb.from("objectives").insert({
      user_id: user.id,
      title,
      type,
      category_id,
      monthly_cap,
      target_amount,
      due_date,
      notes,
      is_active: true,
    });
    if (error) return alert(error.message);

    // limpar
    ["#obj-title", "#obj-monthly-cap", "#obj-target", "#obj-due", "#obj-notes"]
      .map((s) => $(s))
      .forEach((el) => el && (el.value = ""));
    await refreshList();
  });

  // =================== Lista cartões ======================
  async function refreshList() {
    const listEl = $("#obj-list");
    const summaryEl = $("#obj-summary");
    if (listEl) listEl.innerHTML = "<div class='row-note'>A carregar…</div>";

    const { data: objs, error } = await sb
      .from("objectives")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) {
      if (listEl) listEl.innerHTML = "Erro a carregar objetivos.";
      return;
    }

    // calcular gastos para cada orçamento
    const cards = [];
    let capsTotal = 0;
    let capsOver = 0;

    for (const o of objs || []) {
      let secondary = "";
      let progress = 0,
        current = 0,
        goal = 0;

      if (o.type === "budget_cap") {
        current = await computeSpentForGoal(o); // << soma correta
        goal = Number(o.monthly_cap || 0);
        progress = goal ? Math.min(100, (current / goal) * 100) : 0;
        secondary = `Teto: ${money(goal)} · Gasto: ${money(current)}`;

        capsTotal += goal ? 1 : 0;
        if (goal && current > goal) capsOver += 1;
      } else if (o.type === "savings_goal") {
        current = Number(o.current_amount || 0);
        goal = Number(o.target_amount || 0);
        progress = goal ? Math.min(100, (current / goal) * 100) : 0;
        secondary = `Meta: ${money(goal)} · Acumulado: ${money(current)}`;
      } else {
        secondary = o.notes || "Alerta personalizado";
      }

      const warn =
        o.type === "budget_cap" && goal && current > goal
          ? "color:#b91c1c"
          : "";
      const due = o.due_date
        ? `<span class="row-note">Limite: ${o.due_date}</span>`
        : "";

      cards.push(`
        <div class="card" data-id="${o.id}">
          <div class="cat-card__row" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div class="cat-card__title"><strong>${o.title}</strong></div>
            <div><button class="icon-btn" data-edit="${o.id}" title="Editar">✏️</button></div>
          </div>
          <div class="cat-card__subtitle" style="${warn}">${secondary}</div>
          <div style="margin-top:8px;background:#f1f5f9;border-radius:999px;height:8px;overflow:hidden">
            <div style="height:8px;width:${progress.toFixed(0)}%;background:#10b981"></div>
          </div>
          ${due}
        </div>
      `);
    }

    if (listEl)
      listEl.innerHTML =
        cards.join("") || "<div class='row-note'>Sem objetivos ainda.</div>";

    // ligar botões de edição
    listEl
      ?.querySelectorAll("[data-edit]")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          openEdit(btn.getAttribute("data-edit"))
        )
      );

    // resumo
    if (summaryEl) {
      summaryEl.innerHTML = capsTotal
        ? `Tetos ativos: <strong>${capsTotal}</strong> · A ultrapassar: <strong>${capsOver}</strong>`
        : "Sem tetos ativos este mês.";
    }
  }

  // =================== Modal editar ======================
  const modal = $("#obj-edit-modal");
  function openEdit(id) {
    loadEdit(id);
    show(modal, true);
  }
  function closeEdit() {
    show(modal, false);
  }
  modal?.querySelector("[data-close]")?.addEventListener("click", closeEdit);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeEdit();
  });

  async function loadEdit(id) {
    const { data: o, error } = await sb
      .from("objectives")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !o) return;

    $("#ed-id").value = o.id;
    $("#ed-title").value = o.title || "";
    $("#ed-type").value = o.type || "budget_cap";
    $("#ed-category").value = o.category_id || "";
    $("#ed-monthly-cap").value = o.monthly_cap || "";
    $("#ed-target").value = o.target_amount || "";
    $("#ed-current").value = o.current_amount || "";
    $("#ed-due").value = o.due_date || "";
    $("#ed-active").value = String(!!o.is_active);
    $("#ed-notes").value = o.notes || "";
  }

  $("#ed-save")?.addEventListener("click", async () => {
    const id = $("#ed-id").value;
    if (!id) return;

    const payload = {
      title: $("#ed-title").value.trim(),
      type: $("#ed-type").value,
      category_id: $("#ed-category").value || null,
      monthly_cap: $("#ed-monthly-cap").value
        ? Number($("#ed-monthly-cap").value)
        : null,
      target_amount: $("#ed-target").value
        ? Number($("#ed-target").value)
        : null,
      current_amount: $("#ed-current").value
        ? Number($("#ed-current").value)
        : 0,
      due_date: $("#ed-due").value || null,
      is_active: $("#ed-active").value === "true",
      notes: $("#ed-notes").value || null,
    };

    const { error } = await sb.from("objectives").update(payload).eq("id", id);
    if (error) return alert(error.message);

    closeEdit();
    await refreshList();
  });

  $("#ed-delete")?.addEventListener("click", async () => {
    const id = $("#ed-id").value;
    if (!id) return;
    if (!confirm("Eliminar este objetivo?")) return;
    const { error } = await sb.from("objectives").delete().eq("id", id);
    if (error) return alert(error.message);
    closeEdit();
    await refreshList();
  });

  $("#ed-cancel")?.addEventListener("click", closeEdit);

  // =================== Boot ======================
  await loadCategories([$("#obj-category"), $("#ed-category")]);
  refreshCreateForm();
  await refreshList();
}
