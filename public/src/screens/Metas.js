// src/screens/Metas.js
import { loadTheme } from "../lib/theme.js";

export async function init({ sb, outlet } = {}) {
  sb ||= window.sb;
  if (sb) await loadTheme(sb);
  
  // Wait for DOM to catch up
  await new Promise(r => setTimeout(r, 150));

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
      return alert("Defina o teto mensal (€).");
    if (type === "savings_goal" && (!target_amount || target_amount <= 0))
      return alert("Defina a meta (€).");

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

    ["#obj-title", "#obj-monthly-cap", "#obj-target", "#obj-due", "#obj-notes"].forEach((s) => {
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
    const from = `${today.getFullYear()}-01-01`;
    const to = `${today.getFullYear() + 1}-01-01`;

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

  async function fetchPortfolioTx(portfolio_id, fromISO = "1970-01-01", toISO = ymd(new Date())) {
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

  function buildPortfolioSeries({ aprPct, compounding = "monthly", initial_amount = 0, start_date = null }, txs, fromISO, toISO) {
    const r = Number(aprPct || 0) / 100;
    const months = monthKeysBetween(fromISO.slice(0, 7), toISO.slice(0, 7));
    const byMonth = new Map(months.map((k) => [k, { contrib: 0, interest: 0, balance: 0 }]));
    for (const t of txs) {
      const k = String(t.date).slice(0, 7);
      if (!byMonth.has(k)) byMonth.set(k, { contrib: 0, interest: 0, balance: 0 });
      byMonth.get(k).contrib += Number(t.amount || 0);
    }
    let balance = Number(initial_amount || 0);
    const annivMonth = start_date ? Number(String(start_date).slice(5, 7)) : Number(fromISO.slice(5, 7));
    const out = [];
    for (const k of months) {
      const row = byMonth.get(k) || { contrib: 0, interest: 0, balance: 0 };
      balance += row.contrib;
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

  function generateProjectionSVG(initial, monthly, apr, years, compounding, color) {
    const months = Math.max(1, (years || 1) * 12);
    const rate = (apr || 0) / 100;
    let balance = initial;
    const points = [balance];
    
    for (let m = 1; m <= months; m++) {
      if (compounding === 'monthly') {
        balance = balance * (1 + rate / 12) + (monthly || 0);
      } else {
        balance += (monthly || 0);
        if (m % 12 === 0) balance = balance * (1 + rate);
      }
      points.push(balance);
    }

    const width = 200;
    const height = 40;
    const max = Math.max(...points, 1);
    const min = 0; // Start from 0 to show the full magnitude and the exponential curve
    const range = max || 1;
    
    const xStep = width / (points.length - 1);
    const polyPoints = points.map((p, i) => {
      const x = i * xStep;
      const y = height - (p / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathData = "M" + polyPoints.join(" L");
    const areaData = pathData + ` L${width},${height} L0,${height} Z`;
    const gradId = `grad-${Math.random().toString(36).substr(2, 9)}`;

    return `
      <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:${height}px; display:block; overflow:visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.3" />
            <stop offset="100%" stop-color="${color}" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d="${areaData}" fill="url(#${gradId})" />
        <path d="${pathData}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
  }

  function computeSpentForGoal(o, monthAgg, yearAgg) {
    if (o.type !== "budget_cap") return 0;
    if (Number(o.target_amount) > 0 && !Number(o.monthly_cap)) {
      return yearAgg ? yearAgg.total : 0;
    }
    if (!monthAgg) return 0;
    if (!o.category_id) return monthAgg.total;
    return Number(monthAgg.byCat.get(o.category_id) || 0);
  }

  async function computeSavingsForGoal(o) {
    const SAV = await getTypeId("SAVINGS");
    const start = o.start_from ? String(o.start_from).slice(0, 10) : "1970-01-01";
    const end = o.due_date || ymd(new Date());
    const { data, error } = await sb
      .from("transactions")
      .select("amount")
      .eq("type_id", SAV)
      .gte("date", start)
      .lte("date", end);
    if (error) return Number(o.current_amount || 0);
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
    const cards = await Promise.all(pf.map(async (p) => {
      const fromISO = (p.start_date || p.created_at || "1970-01-01").slice(0, 10);
      const tx = await fetchPortfolioTx(p.id, fromISO, toISO);
      const series = buildPortfolioSeries({ aprPct: p.apr, compounding: p.compounding, initial_amount: Number(p.initial_amount || 0), start_date: p.start_date }, tx, fromISO, toISO);
      const aportes = (tx || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const invested = Number(p.initial_amount || 0) + aportes;
      const current = series.length ? series[series.length - 1].balance : invested;
      const interest = current - invested;
      const color = p.color || "#0ea5e9";
      
      const initial = Number(p.initial_amount || 0);
      const dca = Number(p.monthly_contribution || 0);
      const years = Number(p.target_years || 5);
      const chartSvg = generateProjectionSVG(initial, dca, p.apr, years, p.compounding, color);
      
      // Calculate future total starting from initial_amount
      let futureTotal = initial;
      const months = years * 12;
      const apr = Number(p.apr || 0) / 100;
      if (p.compounding === "monthly") {
        const rate = apr / 12;
        if (rate === 0) futureTotal = initial + (dca * months);
        else {
          const pow = Math.pow(1 + rate, months);
          futureTotal = (initial * pow) + (dca * (pow - 1) / rate);
        }
      } else {
        for (let y = 1; y <= years; y++) {
          futureTotal = (futureTotal + (dca * 12)) * (1 + apr);
        }
      }

      return `
        <div class="cat-card" data-pf="${p.id}" style="border-left:5px solid ${color}; padding: 16px; transition: transform 0.2s ease; cursor: pointer;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
          <div class="cat-card__row" style="display:flex;justify-content:space-between;align-items:center;gap:8px; margin-bottom: 12px;">
            <div class="cat-card__title" style="font-size: 1.1em;"><strong>${p.name}</strong> <span class="row-note" style="background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px; margin-left: 4px;">${p.kind}</span></div>
            <div class="row-note" style="font-weight: 600;">${p.apr}% a.a.</div>
            <div style="flex:1"></div>
            <button class="icon-btn" data-pf-edit="${p.id}" title="Editar">
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M12.3 6.7l5 5-8.6 8.6c-.3.3-.6.5-1 .6l-3.6.8a1 1 0 0 1-1.2-1.2l.8-3.6c.1-.4.3-.7.6-1L12.3 6.7Zm1.4-1.4 1.6-1.6a2.5 2.5 0 0 1 3.5 0l1.1 1.1a2.5 2.5 0 0 1 0 3.5l-1.6 1.6-5-5Z" fill="currentColor"/></svg>
            </button>
          </div>
          <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; align-items: end;">
            <div class="cat-card__subtitle" style="display: flex; flex-direction: column; gap: 4px;">
              <div style="display: flex; justify-content: space-between;"><span class="row-note">Investido:</span> <strong>${money(invested)}</strong></div>
              <div style="display: flex; justify-content: space-between;"><span class="row-note">Valor atual:</span> <strong>${money(current)}</strong></div>
              <div style="display: flex; justify-content: space-between;"><span class="row-note">Juros:</span> <strong style="color: #10b981">+${money(interest)}</strong></div>
              ${dca > 0 ? `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #e2e8f0; display: flex; justify-content: space-between;"><span class="row-note">DCA Mensal:</span> <strong style="color: #2563eb">${money(dca)}</strong></div>` : ''}
            </div>
            <div style="text-align: right; background: rgba(255,255,255,0.5); padding: 8px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.03);">
              <div class="row-note" style="margin-bottom: 2px; font-weight: 700;">Em ${years} anos</div>
              <div style="font-weight: 900; font-size: 1.2em; color: #0f172a; margin-bottom: 6px;">${money(futureTotal)}</div>
              <div style="height: 36px; display: flex; align-items: flex-end; opacity: 0.8;">
                ${chartSvg}
              </div>
            </div>
          </div>
        </div>`;
    }));
    wrap.innerHTML = cards.join("");
    wrap.querySelectorAll("[data-pf-edit]").forEach((btn) => btn.addEventListener("click", () => openPfModal(btn.getAttribute("data-pf-edit"))));
  }

  function openPfModal(id = null) {
    const m = document.getElementById("pf-modal");
    if (!m) return;
    const titleEl = document.getElementById("pf-modal-title");
    const idEl = document.getElementById("pf-id");
    if (titleEl) titleEl.textContent = id ? "Editar carteira" : "Nova carteira";
    if (idEl) idEl.value = id || "";
    if (!id) {
      ["pf-name", "pf-apr", "pf-notes", "pf-monthly", "pf-years"].forEach(id => { if (document.getElementById(id)) document.getElementById(id).value = ""; });
      if (document.getElementById("pf-kind")) document.getElementById("pf-kind").value = "Outro";
      if (document.getElementById("pf-comp")) document.getElementById("pf-comp").value = "monthly";
      if (document.getElementById("pf-color")) document.getElementById("pf-color").value = "#0ea5e9";
      if (document.getElementById("pf-initial")) document.getElementById("pf-initial").value = 0;
      if (document.getElementById("pf-start")) document.getElementById("pf-start").value = new Date().toISOString().slice(0, 10);
    } else {
      loadPortfolioIntoForm(id);
    }
    m.hidden = false;
    calculatePortfolioProjection();
  }

  function calculatePortfolioProjection() {
    const initial = Number(document.getElementById("pf-initial")?.value || 0);
    const monthly = Number(document.getElementById("pf-monthly")?.value || 0);
    const apr = Number(document.getElementById("pf-apr")?.value || 0) / 100;
    const years = Number(document.getElementById("pf-years")?.value || 0);
    const compounding = document.getElementById("pf-comp")?.value || "monthly";
    const color = document.getElementById("pf-color")?.value || "#0ea5e9";

    if (years <= 0) {
      if (document.getElementById("pf-proj-total")) document.getElementById("pf-proj-total").textContent = money(initial);
      if (document.getElementById("pf-proj-profit")) document.getElementById("pf-proj-profit").textContent = money(0);
      if (document.getElementById("pf-modal-chart")) document.getElementById("pf-modal-chart").innerHTML = "";
      return;
    }

    let total = initial;
    const months = years * 12;

    if (compounding === "monthly") {
      const rate = apr / 12;
      // Formula: A = P(1+r)^n + PMT * [((1+r)^n - 1) / r]
      if (rate === 0) {
        total = initial + (monthly * months);
      } else {
        const pow = Math.pow(1 + rate, months);
        total = (initial * pow) + (monthly * (pow - 1) / rate);
      }
    } else {
      // Annual compounding (simpler for this quick projection)
      for (let y = 1; y <= years; y++) {
        total = (total + (monthly * 12)) * (1 + apr);
      }
    }

    const invested = initial + (monthly * months);
    const profit = total - invested;

    if (document.getElementById("pf-proj-total")) document.getElementById("pf-proj-total").textContent = money(total);
    if (document.getElementById("pf-proj-profit")) {
      const el = document.getElementById("pf-proj-profit");
      el.textContent = money(profit);
      el.style.color = profit >= 0 ? "#10b981" : "#ef4444";
    }

    const chartWrap = document.getElementById("pf-modal-chart");
    if (chartWrap) {
      chartWrap.innerHTML = generateProjectionSVG(initial, monthly, apr * 100, years, compounding, color);
    }
  }

  // Bind real-time projection
  ["pf-initial", "pf-monthly", "pf-years", "pf-apr", "pf-comp", "pf-color"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", calculatePortfolioProjection);
  });

  async function loadPortfolioIntoForm(id) {
    const { data, error } = await sb.from("portfolios").select("*").eq("id", id).single();
    if (error || !data) return;
    document.getElementById("pf-name").value = data.name || "";
    document.getElementById("pf-kind").value = data.kind || "Outro";
    document.getElementById("pf-apr").value = data.apr || 0;
    document.getElementById("pf-comp").value = data.compounding || "monthly";
    document.getElementById("pf-color").value = data.color || "#0ea5e9";
    document.getElementById("pf-notes").value = data.notes || "";
    document.getElementById("pf-initial").value = data.initial_amount || 0;
    document.getElementById("pf-start").value = data.start_date || new Date().toISOString().slice(0, 10);
    if (document.getElementById("pf-monthly")) document.getElementById("pf-monthly").value = data.monthly_contribution || "";
    if (document.getElementById("pf-years")) document.getElementById("pf-years").value = data.target_years || "";
    calculatePortfolioProjection();
  }

  function closePfModal() {
    const m = document.getElementById("pf-modal");
    if (m) m.hidden = true;
  }

  document.getElementById("pf-new")?.addEventListener("click", () => openPfModal());
  document.querySelector("#pf-modal .modal__close")?.addEventListener("click", closePfModal);
document.getElementById("pf-save")?.addEventListener("click", async () => {
    // Helper to convert empty string to null or parse number properly
    const parseNum = (val) => {
      if (!val || !val.trim()) return null;
      const n = Number(val.trim());
      return isNaN(n) ? null : n;
    };
    
    const pfMonthly = document.getElementById("pf-monthly");
    const pfYears = document.getElementById("pf-years");
    
    const payload = {
      id: document.getElementById("pf-id").value || undefined,
      name: document.getElementById("pf-name").value.trim(),
      kind: document.getElementById("pf-kind").value,
      apr: Number(document.getElementById("pf-apr").value || 0),
      compounding: document.getElementById("pf-comp").value,
      color: document.getElementById("pf-color").value || null,
      notes: document.getElementById("pf-notes").value || null,
      initial_amount: Number(document.getElementById("pf-initial").value || 0),
      start_date: document.getElementById("pf-start").value || new Date().toISOString().slice(0, 10),
      monthly_contribution: pfMonthly ? parseNum(pfMonthly.value) : null,
      target_years: pfYears ? parseNum(pfYears.value) : null,
    };
    if (!payload.name) return alert("Indica um nome.");
    await upsertPortfolio(payload);
    closePfModal();
    await renderPortfolios();
  });

  document.getElementById("pf-del")?.addEventListener("click", async () => {
    const id = document.getElementById("pf-id").value;
    if (!id || !confirm("Eliminar esta carteira?")) return;
    await deletePortfolio(id);
    closePfModal();
    await renderPortfolios();
  });

  async function refreshList() {
    const { data: objs, error } = await sb.from("objectives").select("*").eq("is_active", true).order("created_at", { ascending: false });
    if (error) {
      $("#obj-list").innerHTML = `<div class="row-note">Erro a carregar objetivos.</div>`;
      return;
    }
    const monthAgg = await computeMonthExpenseTotals();
    const yearAgg = await computeYearExpenseTotals();
    const cardsArr = await Promise.all((objs || []).map(async (o) => {
      let secondary = "";
      let progress = 0, current = 0, goal = 0, ratio = 0;
      if (o.type === "budget_cap") {
        current = computeSpentForGoal(o, monthAgg, yearAgg);
        const isYearly = Number(o.target_amount) > 0 && !Number(o.monthly_cap);
        goal = isYearly ? Number(o.target_amount || 0) : Number(o.monthly_cap || 0);
        ratio = goal ? current / goal : 0;
        progress = Math.min(100, ratio * 100);
        let label = isYearly ? "Anual" : (!o.category_id ? "Mensal" : "Teto");
        secondary = `${label}: ${money(goal)} · Gasto: ${money(current)}`;
      } else if (o.type === "savings_goal") {
        const manual = Number(o.current_amount || 0);
        const auto = await computeSavingsForGoal(o);
        current = manual > 0 ? manual : auto;
        goal = Number(o.target_amount || 0);
        ratio = goal ? current / goal : 0;
        progress = Math.min(100, ratio * 100);
        secondary = `Meta: ${money(goal)} · Acumulado: ${money(current)}`;
      }
      let color = o.type === "savings_goal" ? (ratio < 0.3 ? "#ef4444" : ratio < 0.7 ? "#f59e0b" : "#10b981") : (ratio < 0.7 ? "#10b981" : ratio < 1 ? "#f59e0b" : "#ef4444");
      const isBudget = o.type.startsWith("budget_");
      const warn = isBudget && goal && current > goal ? "color:#b91c1c" : "";
      const due = o.due_date ? `<span class="row-note">Limite: ${o.due_date}</span>` : "";
      return `<div class="card" data-id="${o.id}">
          <div class="cat-card__row" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div class="cat-card__title"><strong>${o.title}</strong> <span style="margin-left:8px; font-size:0.85em; color:${color}; font-weight:800">${(ratio * 100).toFixed(0)}%</span></div>
            <div style="display:flex;gap:4px">
              <button class="icon-btn" data-edit="${o.id}" title="Editar"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M12.3 6.7l5 5-8.6 8.6c-.3.3-.6.5-1 .6l-3.6.8a1 1 0 0 1-1.2-1.2l.8-3.6c.1-.4.3-.7.6-1L12.3 6.7Zm1.4-1.4 1.6-1.6a2.5 2.5 0 0 1 3.5 0l1.1 1.1a2.5 2.5 0 0 1 0 3.5l-1.6 1.6-5-5Z" fill="currentColor"/></svg></button>
              <button class="icon-btn" data-delete="${o.id}" title="Eliminar" style="color:#ef4444"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
          </div>
          <div style="margin-top:8px">
              <div class="cat-card__subtitle" style="${warn}">${secondary}</div>
              <div style="margin-top:8px;background:#f1f5f9;border-radius:999px;height:8px;overflow:hidden"><div style="height:8px;width:${progress.toFixed(0)}%;background:${color}"></div></div>
              ${due}
          </div>
        </div>`;
    }));
    $("#obj-list").innerHTML = cardsArr.join("") || '<div class="row-note">Sem objetivos ainda.</div>';
    const objList = $("#obj-list");
    if (objList) {
      objList.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => openEdit(btn.getAttribute("data-edit"))));
      objList.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete");
        if (!confirm("Tem a certeza que deseja eliminar esta meta?")) return;
        const { error } = await sb.from("objectives").delete().eq("id", id);
        if (error) return alert("Erro ao eliminar: " + error.message);
        await refreshList();
      }));
    }
    const caps = (objs || []).filter(o => o.type === "budget_cap" && o.monthly_cap);
    const over = caps.filter(o => computeSpentForGoal(o, monthAgg, yearAgg) > Number(o.monthly_cap || 0));
    $("#obj-summary").innerHTML = caps.length > 0 ? `Tetos ativos: <strong>${caps.length}</strong> · A ultrapassar: <strong>${over.length}</strong>` : "Sem tetos ativos este mês.";
  }

  function mulberry32(seed) {
    let t = seed + 0x6d2b79f5;
    return function () {
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(a, seed) {
    const r = mulberry32(seed), x = a.slice();
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  }

  let suggsCache = [];
  let manualSeedBump = 0;

  function renderSuggestionsFromCache() {
    const wrap = $("#obj-suggestions");
    if (!wrap || !suggsCache.length) {
      if (wrap) wrap.innerHTML = `<div class="row-note">Sem sugestões no momento.</div>`;
      return;
    }
    let pool = suggsCache.filter(s => s.avg > 0 || s.cur > 0);
    const allIdx = pool.findIndex(s => s.id == null);
    const allObj = allIdx >= 0 ? pool.splice(allIdx, 1)[0] : null;
    pool = seededShuffle(pool, (Number(new Date().toISOString().slice(0, 10).replace(/-/g, "")) * 10 + Math.floor(new Date().getHours() / 8) + manualSeedBump));
    const top = allObj ? [allObj, ...pool.slice(0, 5)] : pool.slice(0, 6);
    const maxRef = Math.max(1, ...top.map(s => Math.max(s.avg, s.cur)));
    wrap.innerHTML = top.map(s => {
      const avgW = Math.round((s.avg / maxRef) * 100);
      const curW = Math.round((s.cur / maxRef) * 100);
      const catAttr = s.id == null ? "uncat" : s.id;
      return `<div class="sugg-card" data-cat="${catAttr}">
        <div class="sugg-head"><div class="sugg-title">${s.name}</div><div class="row-note">média 6m</div></div>
        <div class="sugg-bars"><div class="sugg-bar-avg" style="width:${avgW}%"></div><div class="sugg-bar-cur" style="width:${curW}%"></div></div>
        <div class="sugg-meta"><span>Média: <strong>${money(s.avg)}</strong></span><span>Este mês: <strong>${money(s.cur)}</strong></span></div>
        <button class="sugg-btn" data-make="${catAttr}" data-cap="${s.suggested}" data-name="${s.name}">Criar teto ${money(s.suggested)}</button>
      </div>`;
    }).join("");
    wrap.querySelectorAll("[data-make]").forEach(btn => btn.addEventListener("click", () => {
      const val = btn.getAttribute("data-make");
      const cap = Number(btn.getAttribute("data-cap") || 0);
      const name = btn.getAttribute("data-name") || "";
      const typeEl = document.querySelector("#obj-type");
      const catEl = document.querySelector("#obj-category");
      const capEl = document.querySelector("#obj-monthly-cap");
      const titleEl = document.querySelector("#obj-title");
      if (typeEl) typeEl.value = "budget_cap";
      if (catEl) catEl.value = (val === "uncat" ? "" : val);
      if (capEl) capEl.value = cap ? String(cap) : "";
      if (titleEl && !titleEl.value.trim()) titleEl.value = `Teto ${name}`;
      window.__refreshObjForm?.();
      titleEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      titleEl?.focus();
    }));
  }

  async function loadSuggestions() {
    const wrap = $("#obj-suggestions");
    if (!wrap) return;
    const EXPENSE = await getTypeId("EXPENSE");
    const today = new Date();
    const curFrom = firstDay(today.getFullYear(), today.getMonth());
    const nextFrom = firstDay(today.getFullYear(), today.getMonth() + 1);
    const histFrom = firstDay(addMonths(new Date(curFrom), -6).getFullYear(), addMonths(new Date(curFrom), -6).getMonth());
    const { data, error } = await sb.from("transactions").select("date,amount,category:categories(id,name)").eq("type_id", EXPENSE).gte("date", histFrom).lt("date", nextFrom);
    if (error) { wrap.innerHTML = `<div class="row-note">Sem dados para sugestões.</div>`; return; }
    const ym = d => String(d).slice(0, 7);
    const curYM = ym(curFrom);
    const byCat = new Map();
    for (const r of data || []) {
      const id = r.category?.id ?? "uncat";
      const name = r.category?.name ?? "Sem categoria";
      if (!byCat.has(id)) byCat.set(id, { id, name, cur: 0, histSum: 0, months: new Set() });
      const b = byCat.get(id);
      const val = Number(r.amount || 0);
      if (ym(r.date) === curYM) b.cur += val; else { b.histSum += val; b.months.add(ym(r.date)); }
    }
    let curTotal = 0, histTotal = 0; const histMonths = new Set();
    for (const v of byCat.values()) { curTotal += v.cur; histTotal += v.histSum; v.months.forEach(m => histMonths.add(m)); }
    byCat.set("ALL", { id: null, name: "Todas as despesas (geral)", cur: curTotal, histSum: histTotal, months: histMonths });
    suggsCache = Array.from(byCat.values()).map(b => {
      const histCount = b.months.size || 6;
      const avg = b.histSum / histCount;
      return { id: b.id, name: b.name, avg, cur: b.cur, suggested: Math.max(0, Math.round((avg * 0.9) / 5) * 5) };
    });
    renderSuggestionsFromCache();
  }

  async function openEdit(id) {
    const m = $("#obj-edit-modal");
    if (!m) return;
    await loadEdit(id);
    show(m, true);
  }
  function closeEdit() { const m = $("#obj-edit-modal"); if (m) show(m, false); }
  $("#obj-edit-modal")?.querySelector("[data-close]")?.addEventListener("click", closeEdit);
  $("#obj-edit-modal")?.addEventListener("click", (e) => { if (e.target.id === "obj-edit-modal") closeEdit(); });

  async function loadEdit(id) {
    const { data: o, error } = await sb.from("objectives").select("*").eq("id", id).single();
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
      title: $("#ed-title").value.trim(), type: $("#ed-type").value, category_id: $("#ed-category").value || null,
      monthly_cap: $("#ed-monthly-cap").value ? Number($("#ed-monthly-cap").value) : null,
      target_amount: $("#ed-target").value ? Number($("#ed-target").value) : null,
      current_amount: $("#ed-current").value ? Number($("#ed-current").value) : 0,
      due_date: $("#ed-due").value || null, is_active: $("#ed-active").value === "true", notes: $("#ed-notes").value || null,
    };
    const { error } = await sb.from("objectives").update(payload).eq("id", id);
    if (error) return alert(error.message);
    closeEdit(); await refreshList();
  });

  $("#ed-delete")?.addEventListener("click", async () => {
    const id = $("#ed-id").value;
    if (!id || !confirm("Eliminar este objetivo?")) return;
    const { error } = await sb.from("objectives").delete().eq("id", id);
    if (error) return alert(error.message);
    closeEdit(); await refreshList();
  });

  $("#ed-cancel")?.addEventListener("click", closeEdit);

  async function loadAllocationSuggestions() {
    const card = $("#obj-allocation-card");
    const list = $("#obj-allocation-list");
    const avgIncomeEl = $("#obj-avg-income");
    if (!card || !list) return;
    try {
      const profile = await repo.getFinancialProfile();
      if (!profile || (profile.strategy.emergency === 0 && profile.strategy.investment === 0 && profile.strategy.savings === 0)) { card.style.display = "none"; return; }
      const averageIncome = profile.averages.net;
      if (averageIncome <= 0) { card.style.display = "none"; return; }
      if (avgIncomeEl) avgIncomeEl.textContent = money(averageIncome);
      card.style.display = "block";
      const allocations = profile.calculateAllocation();
      const funds = [
        { name: "Fundo de Emergência", pct: profile.strategy.emergency, val: allocations.emergency, color: "#10b981" },
        { name: "Fundo de Investimento", pct: profile.strategy.investment, val: allocations.investment, color: "#2563eb" },
        { name: "Fundo de Poupança", pct: profile.strategy.savings, val: allocations.savings, color: "#3b82f6" }
      ].filter(f => f.pct > 0);
      list.innerHTML = funds.map(f => `<div class="card soft" style="border-left: 4px solid ${f.color}; padding: 12px; margin: 0">
          <div style="font-size: 0.85em; color: var(--muted); font-weight: 600">${f.name}</div>
          <div style="font-size: 1.1em; font-weight: 700; margin: 4px 0">${money(f.val)}</div>
          <div style="font-size: 0.8em; color: ${f.color}; font-weight: 700">${f.pct}% da liquidez</div>
        </div>`).join("");
    } catch (err) { card.style.display = "none"; }
  }

  // ========= INIT PRINCIPAL =========
  await loadCategories([$("#obj-category"), $("#ed-category")]);
  refreshCreateForm();
  await Promise.all([refreshList(), loadSuggestions()]);
  loadAllocationSuggestions();
  document.querySelector("#obj-sugg-refresh")?.addEventListener("click", () => { manualSeedBump++; renderSuggestionsFromCache(); });

  (function watchSlotChange() {
    let lastSlot = Math.floor(new Date().getHours() / 8);
    setInterval(async () => {
      const nowSlot = Math.floor(new Date().getHours() / 8);
      if (nowSlot !== lastSlot) { lastSlot = nowSlot; manualSeedBump = 0; await loadSuggestions(); }
    }, 60 * 1000);
  })();

  const outletEl = document.getElementById("outlet");
  const rootContext = outlet || outletEl || document;
  rootContext.querySelectorAll(".section-toggle-header").forEach((header) => {
    if (header._toggleAttached) return;
    header.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, select, textarea")) return;
      const card = header.closest(".section-toggle-card");
      const body = card?.querySelector(".card-body");
      const chev = header.querySelector(".chevron-anim");
      if (body) {
        const isCollapsed = body.classList.toggle("collapsed");
        body.style.display = isCollapsed ? "none" : "";
        if (chev) chev.classList.toggle("rotated", !isCollapsed);
      }
    });
    header._toggleAttached = true;
  });

  rootContext.querySelectorAll(".section-toggle-card").forEach((card) => {
    const body = card.querySelector(".card-body");
    const chev = card.querySelector(".chevron-anim");
    if (!body || !chev) return;
    const isCollapsed = body.classList.contains("collapsed");
    if (isCollapsed) body.style.display = "none";
    chev.classList.toggle("rotated", !isCollapsed);
  });

  const pfCard = rootContext.querySelector("#pf-card") || document.getElementById("pf-card");
  if (pfCard) {
    const pfBody = pfCard.querySelector(".card-body");
    const pfChev = pfCard.querySelector(".chevron-anim");
    pfBody?.classList.remove("collapsed");
    if (pfBody) pfBody.style.display = "block";
    pfChev?.classList.add("rotated");
  }

  await renderPortfolios();
}
