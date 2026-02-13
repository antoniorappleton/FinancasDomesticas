// src/screens/objetivos.js
import { loadTheme } from "../lib/theme.js";
export async function init({ sb, outlet } = {}) {
  sb ||= window.sb;
  if (sb) await loadTheme(sb);
  const $ = (sel) =>
    (outlet && outlet.querySelector(sel)) || document.querySelector(sel);

  async function getUserId() {
    return (await sb.auth.getUser()).data?.user?.id;
  }

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

  async function computeYearExpenseTotals() {
    const EXPENSE = await getTypeId("EXPENSE");
    const today = new Date();
    const from = `${today.getFullYear()}-01-01`; // start of year
    const to = `${today.getFullYear() + 1}-01-01`; // start of next year

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

  //======== Carteiras Poupanças acumuladas para meta =========

  function monthKeysBetween(fromISO, toISO) {
    const out = [];
    const [y1, m1] = fromISO.split("-").map(Number);
    const [y2, m2] = toISO.split("-").map(Number);
    for (let y = y1, m = m1; y < y2 || (y === y2 && m <= m2); ) {
      out.push(`${y}-${pad2(m)}`);
      m++;
      if (m === 13) {
        m = 1;
        y++;
      }
    }
    return out;
  }

  async function listPortfolios() {
    const uid = await getUserId();
    const { data, error } = await sb
      .from("portfolios")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  async function upsertPortfolio(payload) {
    if (payload.id) {
      const { error } = await sb
        .from("portfolios")
        .update(payload)
        .eq("id", payload.id);
      if (error) throw error;
    } else {
      const uid = await getUserId();
      const { error } = await sb
        .from("portfolios")
        .insert({ ...payload, user_id: uid });
      if (error) throw error;
    }
  }
  async function deletePortfolio(id) {
    const { error } = await sb.from("portfolios").delete().eq("id", id);
    if (error) throw error;
  }
  async function getSavingsTypeId() {
    const { data } = await sb
      .from("transaction_types")
      .select("id,code")
      .eq("code", "SAVINGS")
      .single();
    return data?.id;
  }
  async function fetchPortfolioTx(
    portfolio_id,
    fromISO = "1970-01-01",
    toISO = ymd(new Date()),
  ) {
    const SAV = await getSavingsTypeId();
    const { data, error } = await sb
      .from("transactions")
      .select("date,amount")
      .eq("type_id", SAV)
      .eq("portfolio_id", portfolio_id)
      .gte("date", fromISO)
      .lte("date", toISO)
      .order("date", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  // devolve série mensal: [{key:'YYYY-MM', balance, contrib, interest}]
  function buildPortfolioSeries(
    { aprPct, compounding = "monthly", initial_amount = 0, start_date = null },
    txs,
    fromISO,
    toISO,
  ) {
    const r = Number(aprPct || 0) / 100; // taxa anual em decimal
    const months = monthKeysBetween(fromISO.slice(0, 7), toISO.slice(0, 7));

    const byMonth = new Map(
      months.map((k) => [k, { contrib: 0, interest: 0, balance: 0 }]),
    );
    for (const t of txs) {
      const k = String(t.date).slice(0, 7);
      if (!byMonth.has(k))
        byMonth.set(k, { contrib: 0, interest: 0, balance: 0 });
      byMonth.get(k).contrib += Number(t.amount || 0);
    }

    let balance = Number(initial_amount || 0);

    // Para capitalização anual, usa o mês “aniversário” da carteira (start_date);
    // se não houver, usa o mês do primeiro período (fromISO)
    const annivMonth = start_date
      ? Number(String(start_date).slice(5, 7))
      : Number(fromISO.slice(5, 7));

    const out = [];
    for (const k of months) {
      const row = byMonth.get(k) || { contrib: 0, interest: 0, balance: 0 };

      // aportes do mês
      balance += row.contrib;

      // juros
      let i = 0;
      if (compounding === "monthly") {
        i = balance > 0 ? balance * (r / 12) : 0;
      } else {
        const m = Number(k.slice(5, 7));
        if (balance > 0 && m === annivMonth) i = balance * r;
      }

      balance += i;
      row.interest = i;
      row.balance = balance;
      out.push({ key: k, ...row });
    }
    return out;
  }

  // antes: async function computeSpentForGoal(o, monthAgg) { ... }
  // Atualizado para suportar Orçamentos Globais (hack via campos)
  function computeSpentForGoal(o, monthAgg, yearAgg) {
    if (o.type !== "budget_cap") return 0;

    // Se tiver target_amount mas não tiver monthly_cap, assumimos ANUAL
    if (Number(o.target_amount) > 0 && !Number(o.monthly_cap)) {
      return yearAgg ? yearAgg.total : 0;
    }

    if (!monthAgg) return 0;
    if (!o.category_id) return monthAgg.total; // teto geral do mês
    return Number(monthAgg.byCat.get(o.category_id) || 0);
  }

  async function computeSavingsForGoal(o) {
    const SAV = await getTypeId("SAVINGS");

    // ✅ incluir poupanças anteriores à criação da meta:
    // Se no futuro adicionares um campo 'start_from' na tabela 'objectives',
    // ele será usado; caso contrário, apanha "desde sempre".
    const start = o.start_from
      ? String(o.start_from).slice(0, 10)
      : "1970-01-01";
    const end = o.due_date || ymd(new Date());

    const { data, error } = await sb
      .from("transactions")
      .select("amount")
      .eq("type_id", SAV)
      .gte("date", start)
      .lte("date", end);

    if (error) return Number(o.current_amount || 0);

    // Se registas as poupanças com sinal negativo, converte para absoluto:
    // return (data || []).reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0);

    return (data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  }

  async function renderPortfolios() {
    const wrap = $("#pf-list");
    if (!wrap) return;

    const pf = await listPortfolios();
    if (!pf.length) {
      wrap.innerHTML = `<div class="row-note">Sem carteiras ainda.</div>`;
      return;
    }

    const toISO = ymd(new Date());
    const cards = await Promise.all(
      pf.map(async (p) => {
        const fromISO = (p.start_date || p.created_at || "1970-01-01").slice(
          0,
          10,
        );
        const tx = await fetchPortfolioTx(p.id, fromISO, toISO);

        const series = buildPortfolioSeries(
          {
            aprPct: p.apr,
            compounding: p.compounding,
            initial_amount: Number(p.initial_amount || 0),
            start_date: p.start_date,
          },
          tx,
          fromISO,
          toISO,
        );

        // Investido = inicial + aportes (deste período)
        const aportes = (tx || []).reduce(
          (s, r) => s + (Number(r.amount) || 0),
          0,
        );
        const invested = Number(p.initial_amount || 0) + aportes;

        const current = series.length
          ? series[series.length - 1].balance
          : invested;
        const interest = current - invested;

        const color = p.color || "#0ea5e9";
        return `
      <div class="cat-card" data-pf="${p.id}" style="border-left:5px solid ${color}">
        <div class="cat-card__row" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div class="cat-card__title"><strong>${p.name}</strong> <span class="row-note">(${p.kind})</span></div>
          <div class="row-note">${p.apr}% a.a. • ${p.compounding === "monthly" ? "cap. mensal" : "cap. anual"}</div>
          <div style="flex:1"></div>
          <button class="icon-btn" data-pf-edit="${p.id}" title="Editar" aria-label="Editar">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12.3 6.7l5 5-8.6 8.6c-.3.3-.6.5-1 .6l-3.6.8a1 1 0 0 1-1.2-1.2l.8-3.6c.1-.4.3-.7.6-1L12.3 6.7Zm1.4-1.4 1.6-1.6a2.5 2.5 0 0 1 3.5 0l1.1 1.1a2.5 2.5 0 0 1 0 3.5l-1.6 1.6-5-5Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
        <div class="cat-card__subtitle">
          Investido: <strong>${money(invested)}</strong> · Valor atual: <strong>${money(current)}</strong> · Juros: <strong>${money(interest)}</strong>
        </div>
      </div>`;
      }),
    );

    wrap.innerHTML = cards.join("");

    // abrir modal editar
    wrap.querySelectorAll("[data-pf-edit]").forEach((btn) => {
      btn.addEventListener("click", () =>
        openPfModal(btn.getAttribute("data-pf-edit")),
      );
    });
  }

  function openPfModal(id = null) {
    const m = document.getElementById("pf-modal");
    if (!m) {
      alert("Modal de carteira não encontrado no HTML (#pf-modal).");
      return;
    }

    const titleEl = document.getElementById("pf-modal-title");
    const idEl = document.getElementById("pf-id");
    const nameEl = document.getElementById("pf-name");
    const kindEl = document.getElementById("pf-kind");
    const aprEl = document.getElementById("pf-apr");
    const compEl = document.getElementById("pf-comp");
    const colorEl = document.getElementById("pf-color");
    const notesEl = document.getElementById("pf-notes");
    const initEl = document.getElementById("pf-initial");
    const startEl = document.getElementById("pf-start");

    // valida elementos
    if (
      !titleEl ||
      !idEl ||
      !nameEl ||
      !kindEl ||
      !aprEl ||
      !compEl ||
      !colorEl ||
      !notesEl ||
      !initEl ||
      !startEl
    ) {
      alert(
        "Campos do modal em falta (confirma IDs: pf-modal-title, pf-id, pf-name, pf-kind, pf-apr, pf-comp, pf-color, pf-notes, pf-initial, pf-start).",
      );
      return;
    }

    titleEl.textContent = id ? "Editar carteira" : "Nova carteira";
    idEl.value = id || "";

    if (!id) {
      nameEl.value = "";
      kindEl.value = "Outro";
      aprEl.value = "";
      compEl.value = "monthly";
      colorEl.value = "#0ea5e9";
      notesEl.value = "";
      initEl.value = 0;
      startEl.value = new Date().toISOString().slice(0, 10);
    } else {
      loadPortfolioIntoForm(id);
    }

    m.hidden = false;
  }

  async function loadPortfolioIntoForm(id) {
    const { data, error } = await sb
      .from("portfolios")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) return;
    document.getElementById("pf-name").value = data.name || "";
    document.getElementById("pf-kind").value = data.kind || "Outro";
    document.getElementById("pf-apr").value = data.apr || 0;
    document.getElementById("pf-comp").value = data.compounding || "monthly";
    document.getElementById("pf-color").value = data.color || "#0ea5e9";
    document.getElementById("pf-notes").value = data.notes || "";
    document.getElementById("pf-initial").value = data.initial_amount || 0;
    document.getElementById("pf-start").value =
      data.start_date || new Date().toISOString().slice(0, 10);
  }
  function closePfModal() {
    document.getElementById("pf-modal").hidden = true;
  }

  // ligações
  document
    .getElementById("pf-new")
    ?.addEventListener("click", () => openPfModal());
  document
    .querySelector("#pf-modal .modal__close")
    ?.addEventListener("click", closePfModal);
  document.getElementById("pf-save")?.addEventListener("click", async () => {
    const payload = {
      id: document.getElementById("pf-id").value || undefined,
      name: document.getElementById("pf-name").value.trim(),
      kind: document.getElementById("pf-kind").value,
      apr: Number(document.getElementById("pf-apr").value || 0),
      compounding: document.getElementById("pf-comp").value,
      color: document.getElementById("pf-color").value || null,
      notes: document.getElementById("pf-notes").value || null,
      initial_amount: Number(document.getElementById("pf-initial").value || 0),
      start_date:
        document.getElementById("pf-start").value ||
        new Date().toISOString().slice(0, 10),
    };

    if (!payload.name) return alert("Indica um nome.");
    await upsertPortfolio(payload);
    closePfModal();
    await renderPortfolios();
  });
  document.getElementById("pf-del")?.addEventListener("click", async () => {
    const id = document.getElementById("pf-id").value;
    if (!id) return;
    if (!confirm("Eliminar esta carteira?")) return;
    await deletePortfolio(id);
    closePfModal();
    await renderPortfolios();
  });

  //======== //FIM Poupanças acumuladas para meta =========

  // ========= LISTA =========
  async function refreshList() {
    const { data: objs, error } = await sb
      .from("objectives")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) {
      $("#obj-list").innerHTML =
        `<div class="row-note">Erro a carregar objetivos.</div>`;
      return;
    }

    const monthAgg = await computeMonthExpenseTotals();
    const yearAgg = await computeYearExpenseTotals();

    const cardsArr = await Promise.all(
      (objs || []).map(async (o) => {
        let secondary = "";
        let progress = 0,
          current = 0,
          goal = 0,
          ratio = 0;

        if (o.type === "budget_cap") {
          current = computeSpentForGoal(o, monthAgg, yearAgg);

          const isYearly =
            Number(o.target_amount) > 0 && !Number(o.monthly_cap);

          if (isYearly) {
            goal = Number(o.target_amount || 0);
          } else {
            goal = Number(o.monthly_cap || 0);
          }

          ratio = goal ? current / goal : 0;
          progress = Math.min(100, ratio * 100);

          let label = "Teto";
          if (isYearly) label = "Anual";
          else if (!o.category_id) label = "Mensal";

          secondary = `${label}: ${money(goal)} · Gasto: ${money(current)}`;
        } else if (o.type === "savings_goal") {
          const manual = Number(o.current_amount || 0);
          const auto = await computeSavingsForGoal(o);
          current = manual > 0 ? manual : auto; // manual tem prioridade se > 0
          goal = Number(o.target_amount || 0);
          ratio = goal ? current / goal : 0;
          progress = Math.min(100, ratio * 100);
          secondary = `Meta: ${money(goal)} · Acumulado: ${money(current)}`;
        } else {
          secondary = o.notes || "Alerta personalizado";
        }

        let color = "";
        if (o.type === "savings_goal") {
          // Poupança: Mais perto de 100% = Mais Verde
          color = ratio < 0.3 ? "#ef4444" : ratio < 0.7 ? "#f59e0b" : "#10b981";
        } else {
          // Despesa (budget_cap): Mais perto de 100% = Mais Vermelho
          color = ratio < 0.7 ? "#10b981" : ratio < 1 ? "#f59e0b" : "#ef4444";
        }

        const isBudget = o.type.startsWith("budget_");
        const warn = isBudget && goal && current > goal ? "color:#b91c1c" : "";
        const due = o.due_date
          ? `<span class="row-note">Limite: ${o.due_date}</span>`
          : "";

        // 👇 trocamos o ícone aqui na secção 2)
        return `
        <div class="card" data-id="${o.id}">
          <div class="cat-card__row" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div class="cat-card__title">
              <strong>${o.title}</strong>
              <span style="margin-left:8px; font-size:0.85em; color:${color}; font-weight:800">
                ${(ratio * 100).toFixed(0)}%
              </span>
            </div>
            <div style="display:flex;gap:4px">
              
              <button class="icon-btn" data-edit="${o.id}" title="Editar" aria-label="Editar">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12.3 6.7l5 5-8.6 8.6c-.3.3-.6.5-1 .6l-3.6.8a1 1 0 0 1-1.2-1.2l.8-3.6c.1-.4.3-.7.6-1L12.3 6.7Zm1.4-1.4 1.6-1.6a2.5 2.5 0 0 1 3.5 0l1.1 1.1a2.5 2.5 0 0 1 0 3.5l-1.6 1.6-5-5Z" fill="currentColor"/>
                </svg>
              </button>
              <button class="icon-btn" data-delete="${o.id}" title="Eliminar" aria-label="Eliminar" style="color:#ef4444">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
          
          <!-- Body fixo (não colapsável) -->
          <div style="margin-top:8px">
              <div class="cat-card__subtitle" style="${warn}">${secondary}</div>
              <div style="margin-top:8px;background:#f1f5f9;border-radius:999px;height:8px;overflow:hidden">
                <div style="height:8px;width:${progress.toFixed(0)}%;background:${color}"></div>
              </div>
              ${due}
          </div>
        </div>`;
      }),
    );

    const cards = cardsArr.join("");
    $("#obj-list").innerHTML =
      cards || '<div class="row-note">Sem objetivos ainda.</div>';

    // === Eventos Toggle REMOVIDOS para cartões individuais ===
    // (Código antigo de toggle-card eliminado)

    // botões editar
    $("#obj-list")
      .querySelectorAll("[data-edit]")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          openEdit(btn.getAttribute("data-edit")),
        ),
      );
    // botões eliminar (X)
    $("#obj-list")
      .querySelectorAll("[data-delete]")
      .forEach((btn) =>
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-delete");
          if (!confirm("Tem a certeza que deseja eliminar esta meta?")) return;
          const { error } = await sb.from("objectives").delete().eq("id", id);
          if (error) return alert("Erro ao eliminar: " + error.message);
          await refreshList();
        }),
      );

    // resumo
    const caps = (objs || []).filter(
      (o) => o.type === "budget_cap" && o.monthly_cap,
    );
    const over = [];
    for (const o of caps) {
      const g = Number(o.monthly_cap || 0);
      const c = computeSpentForGoal(o, monthAgg);
      if (g && c > g) over.push(o.id);
    }

    if (caps.length > 0) {
      const activeCount = caps.length;
      const overCount = over.length;
      $("#obj-summary").innerHTML =
        `Tetos ativos: <strong>${activeCount}</strong> · A ultrapassar: <strong>${overCount}</strong>`;
    } else {
      $("#obj-summary").innerHTML = "Sem tetos ativos este mês.";
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
        ...suggsCache.filter((s) => !top.includes(s)).slice(0, 6 - top.length),
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
      }),
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



  // === Inicializar Toggles de Secções ===
  const outletEl = document.getElementById("outlet");
  const rootContext = outlet || outletEl || document;

  const headers = rootContext.querySelectorAll(".section-toggle-header");
  headers.forEach((header) => {
    if (header._toggleAttached) return;

    header.addEventListener("click", (e) => {
      // 1) Evita disparar se clicou num elemento interativo dentro do header
      if (e.target.closest("button, a, input, select, textarea")) return;

      const card = header.closest(".section-toggle-card");
      if (!card) return;

      const body = card.querySelector(".card-body");
      const chev = header.querySelector(".chevron-anim");

      if (body) {
        // Toggle da classe collapsed
        const isCollapsed = body.classList.toggle("collapsed");
        // Força visibilidade explícita (robustez)
        body.style.display = isCollapsed ? "none" : ""; // vazia volta ao normal (block)

        // Sincroniza ícone
        if (chev) {
          chev.classList.toggle("rotated", !isCollapsed);
        }
      }
    });

    header._toggleAttached = true;
  });

  // 2) Sincronização inicial (garante que ícones batem certo com estado inicial)
  rootContext.querySelectorAll(".section-toggle-card").forEach((card) => {
    const body = card.querySelector(".card-body");
    const chev = card.querySelector(".chevron-anim");
    if (!body || !chev) return;

    const isCollapsed = body.classList.contains("collapsed");
    // Se estiver colapsado no HTML, garante visual
    if (isCollapsed) body.style.display = "none";

    // Ícone: se NÃO colapsado -> rotated (seta p/ cima), se colapsado -> normal
    chev.classList.toggle("rotated", !isCollapsed);
  });

  // 3) Blind Fix: garantir que Carteiras não fica preso invisível
  // 3) Blind Fix: garantir que Carteiras não fica preso invisível
  const pfCard =
    rootContext.querySelector("#pf-card") || document.getElementById("pf-card");
  if (pfCard) {
    console.log("Metas.js: Carteiras card found, forcing visibility.");
    const pfBody = pfCard.querySelector(".card-body");
    const pfChev = pfCard.querySelector(".chevron-anim");

    // remove classe collapsed se existir
    pfBody?.classList.remove("collapsed");

    // FORÇA display block (não apenas vazio)
    if (pfBody) pfBody.style.display = "block";

    // garante seta para baixo
    pfChev?.classList.add("rotated");
  } else {
    console.error("Metas.js: Carteiras card (#pf-card) NOT found in DOM.");
  }

  await renderPortfolios();

  await renderPortfolios();
}
