// src/screens/objetivos.js
export async function init({ sb, outlet } = {}) {
  sb ||= window.sb;
  const $ = (sel) =>
    (outlet && outlet.querySelector(sel)) || document.querySelector(sel);

  // ========= helpers =========
  const money = (n) =>
    "€ " +
    Number(n || 0).toLocaleString("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const firstDay = (y, m) => `${y}-${pad2(m + 1)}-01`;
  const addMonths = (d, n) => {
    const x = new Date(d);
    x.setMonth(x.getMonth() + n);
    return x;
  };
  const show = (el, v = true) => el && (el.hidden = !v);
  const toggle = (el, v) => el && el.classList.toggle("hidden", !v);

  const idsCache = {};
  async function getTypeId(code) {
    if (idsCache[code]) return idsCache[code];
    const { data } = await sb
      .from("transaction_types")
      .select("id")
      .eq("code", code)
      .single();
    idsCache[code] = data?.id;
    return idsCache[code];
  }

  // ========= categorias para selects =========
  async function loadCategories(selectEls) {
    const { data } = await sb
      .from("categories")
      .select("id,name,parent_id")
      .order("name", { ascending: true });
    const opts =
      '<option value="">(sem categoria)</option>' +
      (data || [])
        .map((c) => `<option value="${c.id}">${c.name}</option>`)
        .join("");
    selectEls.forEach((el) => el && (el.innerHTML = opts));
  }

  // ========= form create: alternância =========
  function refreshCreateForm() {
    const t = $("#obj-type")?.value || "budget_cap";
    toggle($("#obj-cat-wrap"), t === "budget_cap");
    toggle($("#obj-cap-wrap"), t === "budget_cap");
    toggle($("#obj-target-wrap"), t === "savings_goal");
  }
  $("#obj-type")?.addEventListener("change", refreshCreateForm);
  window.__refreshObjForm = refreshCreateForm; // usado pelas sugestões

  // ========= guardar novo objetivo =========
  $("#obj-save")?.addEventListener("click", async () => {
    const { data: { user } = {} } = await sb.auth.getUser();
    if (!user) return alert("Sessão expirada.");

    const title = $("#obj-title")?.value?.trim();
    const type = $("#obj-type")?.value || "budget_cap";
    const category_id = $("#obj-category")?.value || null; // null = teto geral do mês
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
      category_id: category_id || null,
      monthly_cap,
      target_amount,
      due_date,
      notes,
    });
    if (error) return alert(error.message);

    // limpar
    [
      "#obj-title",
      "#obj-monthly-cap",
      "#obj-target",
      "#obj-due",
      "#obj-notes",
    ].forEach((s) => {
      if ($(s)) $(s).value = "";
    });
    await Promise.all([refreshList(), loadSuggestions()]);
  });

  // ========= cálculo de gastos do mês =========
  async function computeMonthExpenseTotals() {
    const EXPENSE = await getTypeId("EXPENSE");
    const today = new Date();
    const from = firstDay(today.getFullYear(), today.getMonth());
    const to = firstDay(today.getFullYear(), today.getMonth() + 1);

    const { data, error } = await sb
      .from("transactions")
      .select("amount,category_id")
      .eq("type_id", EXPENSE)
      .gte("date", from)
      .lt("date", to);

    if (error) return { total: 0, byCat: new Map() };

    const byCat = new Map();
    let total = 0;
    for (const r of data || []) {
      const v = Number(r.amount || 0);
      total += v;
      const k = r.category_id ?? "uncat";
      byCat.set(k, (byCat.get(k) || 0) + v);
    }
    return { total, byCat };
  }

  // antes: async function computeSpentForGoal(o, monthAgg) { ... }
  function computeSpentForGoal(o, monthAgg) {
    if (o.type !== "budget_cap") return 0;
    if (!monthAgg) return 0; // segurança
    if (!o.category_id) return monthAgg.total; // teto geral do mês
    return Number(monthAgg.byCat.get(o.category_id) || 0);
  }

  // ========= LISTA =========
  async function refreshList() {
    const { data: objs, error } = await sb
      .from("objectives")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) {
      $(
        "#obj-list"
      ).innerHTML = `<div class="row-note">Erro a carregar objetivos.</div>`;
      return;
    }

    const monthAgg = await computeMonthExpenseTotals();

const cards = (objs || [])
  .map((o) => {
    let secondary = "";
    let progress = 0,
      current = 0,
      goal = 0,
      ratio = 0;

    if (o.type === "budget_cap") {
      current = computeSpentForGoal(o, monthAgg);
      goal = Number(o.monthly_cap || 0);
      ratio = goal ? current / goal : 0;
      progress = Math.min(100, ratio * 100);
      secondary = `Teto: ${money(goal)} · Gasto: ${money(current)}`;
    } else if (o.type === "savings_goal") {
      current = Number(o.current_amount || 0);
      goal = Number(o.target_amount || 0);
      ratio = goal ? current / goal : 0;
      progress = Math.min(100, ratio * 100);
      secondary = `Meta: ${money(goal)} · Acumulado: ${money(current)}`;
    } else {
      secondary = o.notes || "Alerta personalizado";
    }

    const color = ratio < 0.7 ? "#10b981" : ratio < 1 ? "#f59e0b" : "#ef4444";
    const warn =
      o.type === "budget_cap" && goal && current > goal ? "color:#b91c1c" : "";
    const due = o.due_date
      ? `<span class="row-note">Limite: ${o.due_date}</span>`
      : "";

    return `
      <div class="card" data-id="${o.id}">
        <div class="cat-card__row" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div class="cat-card__title"><strong>${o.title}</strong></div>
          <button class="icon-btn" data-edit="${
            o.id
          }" title="Editar">✏️</button>
        </div>
        <div class="cat-card__subtitle" style="${warn}">${secondary}</div>
        <div style="margin-top:8px;background:#f1f5f9;border-radius:999px;height:8px;overflow:hidden">
          <div style="height:8px;width:${progress.toFixed(
            0
          )}%;background:${color}"></div>
        </div>
        ${due}
      </div>`;
  })
  .join("");


    $("#obj-list").innerHTML =
      cards || '<div class="row-note">Sem objetivos ainda.</div>';

    // botões editar
    $("#obj-list")
      .querySelectorAll("[data-edit]")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          openEdit(btn.getAttribute("data-edit"))
        )
      );

    // resumo
    const caps = (objs || []).filter(
      (o) => o.type === "budget_cap" && o.monthly_cap
    );
    const over = [];
    for (const o of caps) {
      const g = Number(o.monthly_cap || 0);
      const c = await computeSpentForGoal(o, monthAgg);
      if (g && c > g) over.push(o.id);
    }
    $("#obj-summary").innerHTML = caps.length
      ? `Tetos ativos: <strong>${caps.length}</strong> · A ultrapassar: <strong>${over.length}</strong>`
      : "Sem tetos ativos este mês.";

    for (const o of caps) {
      const g = Number(o.monthly_cap || 0);
      const c = computeSpentForGoal(o, monthAgg); // <- já não é await
      if (g && c > g) over.push(o.id);
    }
  }

  // ========= SUGESTÕES RÁPIDAS =========
  // RNG determinístico + shuffle
  function mulberry32(seed) {
    let t = seed + 0x6d2b79f5;
    return function () {
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(a, seed) {
    const r = mulberry32(seed),
      x = a.slice();
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  }

  // cache em memória para o botão ↻
  let suggsCache = [];
  let manualSeedBump = 0;

  // 3 slots por dia: 0-7h59, 8-15h59, 16-23h59
  function currentSlotSeed() {
    const d = new Date();
    const day = Number(d.toISOString().slice(0, 10).replace(/-/g, "")); // YYYYMMDD
    const slot = Math.floor(d.getHours() / 8); // 0..2
    return day * 10 + slot + manualSeedBump;
  }

  // render só a partir da cache (sem nova query)
  function renderSuggestionsFromCache() {
    const wrap = $("#obj-suggestions");
    if (!wrap || !suggsCache.length) {
      if (wrap)
        wrap.innerHTML = `<div class="row-note">Sem sugestões no momento.</div>`;
      return;
    }

    // Amostragem diária determinística (e muda 3×/dia)
    let pool = suggsCache.filter((s) => s.avg > 0 || s.cur > 0);
    const allIdx = pool.findIndex((s) => s.id == null);
    const allObj = allIdx >= 0 ? pool.splice(allIdx, 1)[0] : null;

    pool = seededShuffle(pool, currentSlotSeed());

    const top = [];
    if (allObj) top.push(allObj); // mantém o "geral" quando existe
    for (const s of pool) {
      if (top.length >= 6) break;
      top.push(s);
    }
    if (top.length < 6)
      top.push(
        ...suggsCache.filter((s) => !top.includes(s)).slice(0, 6 - top.length)
      );

    const maxRef = Math.max(1, ...top.map((s) => Math.max(s.avg, s.cur)));

    wrap.innerHTML = top
      .map((s) => {
        const avgW = Math.round((s.avg / maxRef) * 100);
        const curW = Math.round((s.cur / maxRef) * 100);
        const catAttr = s.id == null ? "uncat" : s.id;
        return `
      <div class="sugg-card" data-cat="${catAttr}">
        <div class="sugg-head">
          <div class="sugg-title">${s.name}</div>
          <div class="row-note">média 6m</div>
        </div>
        <div class="sugg-bars">
          <div class="sugg-bar-avg" style="width:${avgW}%"></div>
          <div class="sugg-bar-cur" style="width:${curW}%"></div>
        </div>
        <div class="sugg-meta">
          <span>Média: <strong>${money(s.avg)}</strong></span>
          <span>Este mês: <strong>${money(s.cur)}</strong></span>
        </div>
        <button class="sugg-btn" data-make="${catAttr}" data-cap="${
          s.suggested
        }" data-name="${s.name}">
          Criar teto ${money(s.suggested)}
        </button>
      </div>`;
      })
      .join("");

    // re-anexar os handlers 1-clique (mesmo comportamento de antes)
    wrap.querySelectorAll("[data-make]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-make");
        const cap = Number(btn.getAttribute("data-cap") || 0);
        const name = btn.getAttribute("data-name") || "";
        document.querySelector("#obj-type").value = "budget_cap";
        document.querySelector("#obj-category").value =
          val === "uncat" ? "" : val;
        document.querySelector("#obj-monthly-cap").value = cap
          ? String(cap)
          : "";
        if (
          document.querySelector("#obj-title") &&
          !document.querySelector("#obj-title").value.trim()
        )
          document.querySelector("#obj-title").value = `Teto ${name}`;
        window.__refreshObjForm?.();
        document
          .querySelector("#obj-title")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
        document.querySelector("#obj-title")?.focus();
      })
    );
  }

  async function loadSuggestions() {
    const wrap = $("#obj-suggestions");
    if (!wrap) return;

    const EXPENSE = await getTypeId("EXPENSE");
    const today = new Date();
    const curFrom = firstDay(today.getFullYear(), today.getMonth());
    const nextFrom = firstDay(today.getFullYear(), today.getMonth() + 1);
    const sixAgo = addMonths(new Date(curFrom), -6);
    const histFrom = firstDay(sixAgo.getFullYear(), sixAgo.getMonth());

    const { data, error } = await sb
      .from("transactions")
      .select("date,amount,category:categories(id,name)")
      .eq("type_id", EXPENSE)
      .gte("date", histFrom)
      .lt("date", nextFrom);

    if (error) {
      wrap.innerHTML = `<div class="row-note">Sem dados para sugestões.</div>`;
      return;
    }

    const ym = (d) => String(d).slice(0, 7);
    const curYM = ym(curFrom);
    const byCat = new Map(); // id -> {name, cur, histSum, months:Set}

    for (const r of data || []) {
      const id = r.category?.id ?? "uncat";
      const name = r.category?.name ?? "Sem categoria";
      if (!byCat.has(id))
        byCat.set(id, { id, name, cur: 0, histSum: 0, months: new Set() });
      const b = byCat.get(id);
      const val = Number(r.amount || 0);
      if (ym(r.date) === curYM) b.cur += val;
      else {
        b.histSum += val;
        b.months.add(ym(r.date));
      }
    }

    // também sugerir "teto geral" (sem categoria)
    let curTotal = 0,
      histTotal = 0;
    const histMonths = new Set();
    for (const v of byCat.values()) {
      curTotal += v.cur;
      histTotal += v.histSum;
      v.months.forEach((m) => histMonths.add(m));
    }
    byCat.set("ALL", {
      id: null,
      name: "Todas as despesas (geral)",
      cur: curTotal,
      histSum: histTotal,
      months: histMonths,
    });

    const suggs = Array.from(byCat.values()).map((b) => {
      const histCount = b.months.size || 6;
      const avg = histCount ? b.histSum / histCount : 0;
      const cur = b.cur;
      const suggested = Math.max(0, Math.round((avg * 0.9) / 5) * 5); // 90% da média arredondado
      return { id: b.id, name: b.name, avg, cur, suggested };
    });

    // ⬇️ ... E SUBSTITUI por isto:
    suggsCache = suggs;
    renderSuggestionsFromCache();
  }

  // ========= MODAL EDITAR =========
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

  // ========= arrancar =========
  await loadCategories([$("#obj-category"), $("#ed-category")]);
  refreshCreateForm();
  await Promise.all([refreshList(), loadSuggestions()]);
  // Botão para gerar outras sugestões (re-render só da cache)
  document.querySelector("#obj-sugg-refresh")?.addEventListener("click", () => {
    manualSeedBump++; // muda a “semente” local
    renderSuggestionsFromCache(); // sem nova query
  });

  // Rotação automática 3×/dia: quando muda o “slot”, volta a calcular a cache (1 query)
  (function watchSlotChange() {
    let lastSlot = Math.floor(new Date().getHours() / 8);
    setInterval(async () => {
      const nowSlot = Math.floor(new Date().getHours() / 8);
      if (nowSlot !== lastSlot) {
        lastSlot = nowSlot;
        manualSeedBump = 0; // reset ao botão
        await loadSuggestions(); // refaz a cache a partir da BD (leve e 3×/dia)
      }
    }, 60 * 1000); // verifica a cada minuto
  })();
}
