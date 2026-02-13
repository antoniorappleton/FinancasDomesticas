// src/screens/nova.js
import { repo } from "../lib/repo.js";
import { Toast } from "../lib/ui.js";

import { loadTheme } from "../lib/theme.js";

export async function init({ outlet } = {}) {
  const sb = window.sb;
  if (sb) await loadTheme(sb);
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
  // Use global Toast instead
  const toast = (msg, ok = true) =>
    ok ? Toast.success(msg) : Toast.error(msg);

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
      accRes.error || regRes.error || pmRes.error || stRes.error || ttRes.error,
    );
    toast("Erro a carregar listas", false);
    return;
  }
  const TYPE_ID = Object.fromEntries(
    (ttRes.data || []).map((t) => [t.code, t.id]),
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
      (data || []).filter((c) => !c.parent_id).map((c) => [c.id, c.name]),
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
      coll.compare(a.name, b.name),
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
    // FAB Toggle
    show($("btn-fixed-bulk"), t === "EXPENSE");
    show($("btn-import"), t === "EXPENSE" || t === "INCOME"); // Allow import for Income too

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
          (id) => $(id) && ($(id).value = ""),
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

      toast("Movimento registado ✅");
      ["tx-amount", "tx-desc", "tx-loc", "tx-notes"].forEach(
        (id) => $(id) && ($(id).value = ""),
      );
    } catch (e) {
      console.error(e);
      toast("Erro: " + (e.message || e), false);
    }
  });

  $("tx-clear")?.addEventListener("click", () => {
    ["tx-amount", "tx-desc", "tx-loc", "tx-notes"].forEach(
      (id) => $(id) && ($(id).value = ""),
    );
  });


  // ===== Despesas Fixas em lote (Redesigned) =====
  (function mountFixedBulk() {
    const btn = $("btn-fixed-bulk");
    const modal = document.getElementById("fixed-bulk-modal");
    const listContainer = document.getElementById("fixed-bulk-list");
    const btnCancel = document.getElementById("fixed-bulk-cancel");
    const btnConfirm = document.getElementById("fixed-bulk-confirm");
    const btnClose = modal?.querySelector(".modal__close");
    const totalEl = document.getElementById("fixed-bulk-total");

    if (!btn || !modal || !listContainer || !btnConfirm || !btnCancel) return;

    let groups = [];
    let monthlyId = null;

    function open() {
      modal.hidden = false;
    }
    function close() {
      modal.hidden = true;
    }

    btnCancel.onclick = close;
    btnClose && (btnClose.onclick = close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    async function ensureMonthlyId() {
      if (monthlyId) return monthlyId;
      const { data } = await sb
        .from("regularities")
        .select("id")
        .eq("code", "MONTHLY")
        .limit(1);
      if (data && data.length > 0) monthlyId = data[0].id;
      return monthlyId;
    }

    btn.onclick = async () => {
      try {
        const t = (
          document.querySelector('input[name="tx-type"]:checked')?.value ||
          "INCOME"
        ).toUpperCase();
        if (t !== "EXPENSE") {
          toast("Esta ação é apenas para Despesas.", false);
          return;
        }

        // Logic: Target Month derived from Main Form Date
        const mainDateVal =
          $("tx-date")?.value || new Date().toISOString().slice(0, 10);

        // 1. Fetch Data
        groups = await fetchGroupedExpenses(mainDateVal); // Pass main date to calc suggestions

        if (!groups.length) {
          toast("Não encontrei despesas fixas recentes.", false);
          return;
        }

        // 2. Render
        renderGroups();
        updateTotal();
        open();
      } catch (e) {
        console.error(e);
        toast("Erro: " + (e.message || e), false);
      }
    };

    function renderGroups() {
      listContainer.innerHTML = groups
        .map(
          (g, gIdx) => `
        <div class="bulk-group" data-gidx="${gIdx}">
          <div class="bulk-group-header">
             <div class="bulk-group-title">
                <input type="checkbox" class="grp-check" checked>
                <span>${escapeHtml(g.parentName)}</span>
             </div>
             <span class="bulk-group-total">${money(g.total)}</span>
          </div>
          <div class="bulk-group-body">
             ${g.items
               .map(
                 (item, iIdx) => `
               <div class="bulk-item" data-iidx="${iIdx}">
                 <div class="bulk-item-check">
                    <input type="checkbox" class="itm-check" checked>
                 </div>
                 <div class="bulk-item-info">
                    <div class="bulk-item-desc">${escapeHtml(item.description)}</div>
                    <div class="bulk-item-sub">${escapeHtml(item.subName)}</div>
                 </div>
                 <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-end">
                    <div class="bulk-item-value">
                        <input type="number" class="itm-val" step="0.01" value="${item.suggestedAmount.toFixed(2)}">
                    </div>
                    <div class="bulk-item-date">
                        <input type="date" class="itm-date" value="${item.suggestedDate}" style="width:110px; font-size:0.8em; padding:2px; border:1px solid #ddd; border-radius:4px; text-align:right">
                    </div>
                 </div>
               </div>
             `,
               )
               .join("")}
          </div>
        </div>
      `,
        )
        .join("");

      // Bind Events
      listContainer.querySelectorAll(".bulk-group").forEach((gEl) => {
        const gIdx = gEl.dataset.gidx;
        const group = groups[gIdx];
        const grpCheck = gEl.querySelector(".grp-check");
        const grpTotalEl = gEl.querySelector(".bulk-group-total");

        // Group checkbox toggle
        grpCheck.addEventListener("change", () => {
          const checked = grpCheck.checked;
          group.items.forEach((i) => (i.selected = checked));
          gEl
            .querySelectorAll(".itm-check")
            .forEach((c) => (c.checked = checked));
          recalcGroup(group, grpTotalEl);
          updateTotal();
        });

        // Items events
        gEl.querySelectorAll(".bulk-item").forEach((iEl) => {
          const iIdx = iEl.dataset.iidx;
          const item = group.items[iIdx];
          const itmCheck = iEl.querySelector(".itm-check");
          const itmVal = iEl.querySelector(".itm-val");
          const itmDate = iEl.querySelector(".itm-date");

          itmCheck.addEventListener("change", () => {
            item.selected = itmCheck.checked;
            // Update group checkbox state (indeterminate logic optional, keep simple)
            recalcGroup(group, grpTotalEl);
            updateTotal();
          });

          itmVal.addEventListener("input", () => {
            item.suggestedAmount = Number(itmVal.value || 0);
            if (item.selected) {
              recalcGroup(group, grpTotalEl);
              updateTotal();
            }
          });

          itmDate.addEventListener("change", () => {
            item.suggestedDate = itmDate.value;
          });
        });
      });
    }

    function recalcGroup(group, labelEl) {
      const sum = group.items.reduce(
        (s, i) => s + (i.selected ? i.suggestedAmount : 0),
        0,
      );
      group.total = sum;
      labelEl.textContent = money(sum);
    }

    function updateTotal() {
      const fullSum = groups.reduce((s, g) => s + g.total, 0);
      const count = groups.reduce(
        (c, g) => c + g.items.filter((i) => i.selected).length,
        0,
      );

      // Update footer
      totalEl.innerHTML = `${money(fullSum)} <small style='color:var(--text-sec); font-weight:400'>(${count} itens)</small>`;
    }

    async function fetchGroupedExpenses(targetDateStr) {
      // 1. Fetch Categories for robust naming
      const allCats = await repo.refs.allCategories();
      const catMap = new Map();
      allCats.forEach((c) => catMap.set(c.id, c));

      // 2. Fetch Transactions (Last 6 Months)
      const mid = await ensureMonthlyId();
      const to = new Date();
      const from = new Date(to.getFullYear(), to.getMonth() - 6, 1);

      const { data: tExpData } = await sb
        .from("transaction_types")
        .select("id")
        .eq("code", "EXPENSE")
        .limit(1);
      const expTypeId = tExpData?.[0]?.id;
      if (!expTypeId) throw new Error("Tipo Despesa não encontrado.");

      const { data } = await sb
        .from("transactions")
        .select("amount,description,category_id,date")
        .eq("type_id", expTypeId)
        .eq("expense_nature", "fixed")
        .gte("date", from.toISOString().slice(0, 10))
        .lte("date", to.toISOString().slice(0, 10))
        .order("date", { ascending: true }); // Most recent last

      // Helper: Normalize Description (for uncategorized fallback)
      const normalize = (s) => {
        let n = String(s || "").toLowerCase();
        n = n.replace(
          /\b(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/g,
          "",
        );
        n = n.replace(
          /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/g,
          "",
        );
        n = n.replace(/\b20\d{2}\b/g, "");
        n = n.replace(/\b\d{1,2}[/-]\d{1,2}\b/g, "");
        n = n.replace(/[\(\)\-\/\.#]/g, " ");
        return n.replace(/\s+/g, " ").trim();
      };

      const toTitleCase = (str) =>
        str.replace(
          /\w\S*/g,
          (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(),
        );

      // 3. Aggregate
      const aggMap = new Map(); // key -> { desc, cid, count, sum, lastDate }

      (data || []).forEach((x) => {
        const rawDesc = (x.description || "").trim();
        const cid = x.category_id;
        let key, name;

        // Group by Category if exists, otherwise by Description
        if (cid) {
          key = `cat::${cid}`;
          const c = catMap.get(cid);
          name = c ? c.name : "(Categoria Desconhecida)";
        } else {
          const normDesc = normalize(rawDesc);
          const finalDesc =
            normDesc.length > 2 ? toTitleCase(normDesc) : rawDesc;
          key = `desc::${finalDesc.toLowerCase()}`;
          name = finalDesc;
        }

        if (!aggMap.has(key))
          aggMap.set(key, {
            desc: name,
            cid: cid || null,
            count: 0,
            sum: 0,
            lastDate: null,
          });

        const r = aggMap.get(key);
        r.count++;
        r.sum += Number(x.amount || 0);
        r.lastDate = x.date;
      });

      // Target Year/Month for Suggestions
      const tDate = new Date(targetDateStr);
      const tYear = tDate.getFullYear();
      const tMonth = tDate.getMonth(); // 0-11

      // 4. Build Item List
      const items = Array.from(aggMap.values()).map((r) => {
        const avg = r.sum / r.count; // Average amount

        // Suggested Date Calculation
        let sDate = targetDateStr;
        if (r.lastDate) {
          const ld = new Date(r.lastDate);
          const day = ld.getDate();
          const safeDay = Math.min(
            day,
            new Date(tYear, tMonth + 1, 0).getDate(),
          );
          const sd = new Date(tYear, tMonth, safeDay);
          const z = new Date(sd.getTime() - sd.getTimezoneOffset() * 60000);
          sDate = z.toISOString().slice(0, 10);
        }

        // Resolve names
        let parentName = "Outros";
        let subName = r.desc; // Default to the aggregated name (Category Name or Desc)

        if (r.cid) {
          const c = catMap.get(r.cid);
          if (c) {
            subName = c.name;
            if (c.parent_id) {
              const p = catMap.get(c.parent_id);
              if (p) parentName = p.name;
            } else {
              parentName = c.name;
              subName = "(Geral)";
            }
          }
        } else {
          // If no category, it goes to "Outros" (already set)
          // subName is already set to r.desc
        }

        return {
          description: r.desc || "(Sem descrição)", // Use the Category Name or Clean Desc
          parentName,
          subName,
          suggestedAmount: avg,
          suggestedDate: sDate,
          category_id: r.cid,
          selected: true,
          occurrences: r.count,
        };
      });

      // 5. Group by Parent
      const groupsMap = new Map();
      items.forEach((item) => {
        if (!groupsMap.has(item.parentName)) {
          groupsMap.set(item.parentName, {
            parentName: item.parentName,
            items: [],
            total: 0,
          });
        }
        const g = groupsMap.get(item.parentName);
        g.items.push(item);
        g.total += item.suggestedAmount;
      });

      return Array.from(groupsMap.values()).sort((a, b) =>
        a.parentName.localeCompare(b.parentName),
      );
    }

    btnConfirm.onclick = async () => {
      try {
        const account_id = $("tx-account")?.value;
        if (!account_id || account_id === "__none__")
          throw new Error("Escolhe a conta.");

        const mid = await ensureMonthlyId();
        const {
          data: { user },
        } = await sb.auth.getUser();

        const payloads = [];

        groups.forEach((g) => {
          g.items.forEach((i) => {
            if (i.selected && i.suggestedAmount > 0) {
              payloads.push({
                user_id: user.id,
                type_id: TYPE_ID.EXPENSE,
                account_id,
                category_id: i.category_id || null,
                date: i.suggestedDate, // Use Specific Date
                amount: i.suggestedAmount,
                description: i.description || null,
                expense_nature: "fixed",
                regularity_id: mid || null,
                currency: "EUR",
              });
            }
          });
        });

        if (!payloads.length) {
          toast("Nada selecionado para registar.", false);
          return;
        }

        const { error } = await sb.from("transactions").insert(payloads);
        if (error) throw error;

        toast(`Registadas ${payloads.length} despesas fixas (Mensais) ✅`);
        close();

        // Reset form
        ["tx-amount", "tx-desc", "tx-loc", "tx-notes"].forEach(
          (id) => $(id) && ($(id).value = ""),
        );
      } catch (e) {
        console.error(e);
        toast("Erro: " + (e.message || e), false);
      }
    };

    function escapeHtml(s) {
      return String(s || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function money(v) {
      return "€ " + (Number(v) || 0).toFixed(2).replace(".", ",");
    }
  })();

  // ===== Importar PDF/CSV =====
  
  // ===== ASSISTENTE IA (VOZ & TEXTO) =====
  setupAIAssistant(outlet, TYPE_ID, $, toast);
}

/**
 * AI Assistant for quick text/voice entries
 */
function setupAIAssistant(outlet, TYPE_ID, $, toast) {
  const card = outlet?.querySelector(".card");
  if (!card) return;

  // 1. Injetar Painel (Sem innerHTML no outlet)
  const aiPanel = document.createElement("div");
  aiPanel.id = "ai-assistant-panel";
  aiPanel.className = "ai-panel";
  aiPanel.innerHTML = `
    <div class="ai-header">
      <span>Assistente WiseBudget</span>
      <span style="font-size: 0.8em; font-weight: 400; opacity: 0.7;">Voz ou Texto</span>
    </div>
    <div class="ai-controls">
      <div class="ai-input-wrapper">
        <input type="text" id="ai-text-input" class="ai-input" placeholder="Ex: Gastei 15€ em almoço hoje...">
      </div>
      <button id="ai-mic-btn" class="ai-mic-btn" title="Falar">
         <span class="material-symbols-outlined">mic</span>
      </button>
    </div>
    <div id="ai-status" class="ai-status"></div>
  `;
  // Inserir no topo do card, antes do título "Nova transação"
  card.insertBefore(aiPanel, card.firstChild);

  const input = aiPanel.querySelector("#ai-text-input");
  const micBtn = aiPanel.querySelector("#ai-mic-btn");
  const statusEl = aiPanel.querySelector("#ai-status");

  // Recognition setup
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  if (Speech) {
    recognition = new Speech();
    recognition.lang = "pt-PT";
    recognition.interimResults = true;

    recognition.onstart = () => {
      micBtn.classList.add("ai-listening");
      statusEl.textContent = "A ouvir...";
    };

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      input.value = transcript;
      if (e.results[0].isFinal) {
        processCommand(transcript);
      }
    };

    recognition.onerror = (e) => {
      micBtn.classList.remove("ai-listening");
      const msg = e?.error ? `Erro na voz: ${e.error}` : "Erro na voz. Tenta escrever.";
      statusEl.textContent = msg;
    };

    recognition.onend = () => {
      micBtn.classList.remove("ai-listening");
      if (statusEl.textContent === "A ouvir...") statusEl.textContent = "";
    };
  }

  micBtn.onclick = async () => {
    if (!recognition) return toast("Voz não suportada neste browser", false);

    // 1) Speech + mic em muitos Android falha fora de HTTPS
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      toast("⚠️ Voz precisa de HTTPS (site seguro).", false);
      statusEl.textContent = "Abre em HTTPS / PWA para usar voz.";
      return;
    }

    // 2) Força o pedido de permissão ao microfone (ajuda MUITO no Android)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      toast("Sem permissão de microfone. Ativa nas definições do browser.", false);
      statusEl.textContent = "Permissão de microfone bloqueada.";
      return;
    }

    // 3) Toggle start/stop
    if (micBtn.classList.contains("ai-listening")) {
      recognition.stop();
    } else {
      recognition.start();
    }
  };

  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      processCommand(input.value);
    }
  };

  async function processCommand(cmd) {
    if (!cmd || cmd.length < 3) return;
    statusEl.innerHTML = "<small>A processar...</small>";
    
    try {
      const data = parseFinancialCommand(cmd);
      if (!data.amount) throw new Error("Não percebi o valor.");

      // 2. Preencher Campos (Regra 1 e 2)
      // Tipo (Rádio)
      const typeRadio = document.querySelector(`input[name="tx-type"][value="${data.type}"]`);
      if (typeRadio) {
        typeRadio.checked = true;
        typeRadio.dispatchEvent(new Event("change"));
      }

      // Valor
      const amountEl = $("tx-amount");
      if (amountEl) {
        amountEl.value = data.amount;
        amountEl.dispatchEvent(new Event("input"));
      }

      // Descrição
      const descEl = $("tx-desc");
      if (descEl) {
        descEl.value = data.description;
        descEl.dispatchEvent(new Event("input"));
      }

      // Data (inclui "dia X")
      const dateEl = $("tx-date");
      if (dateEl && data.date) {
        dateEl.value = data.date;
        dateEl.dispatchEvent(new Event("change"));
      }

      // 3. Categoria (Regra 3 - Match Avançado)
      if (data.subject) {
        await matchCategory(data.subject, data.type);
      }

      statusEl.innerHTML = `<div class="ai-feedback">Comando aceite: <strong>${data.type === 'INCOME' ? 'Receita' : 'Despesa'}</strong> de <strong>${data.amount}€</strong></div>`;
      
      // Auto-save: Disparar clique no Guardar existente
      setTimeout(() => {
        const saveBtn = $("tx-save");
        if (saveBtn) saveBtn.click();
        input.value = "";
      }, 1500);

    } catch (err) {
      statusEl.textContent = "Erro: " + err.message;
    }
  }

  /**
   * Parse natural language to financial data
   */
  function parseFinancialCommand(text) {
    const s = text.toLowerCase();
    const result = {
      type: "EXPENSE",
      amount: null,
      description: "",
      subject: "",
      date: new Date().toISOString().slice(0, 10)
    };

    // 1. Tipo
    if (s.includes("recebi") || s.includes("ganhei") || s.includes("ordenado") || s.includes("receita")) {
      result.type = "INCOME";
    }

    // 2. Valor (Procura número seguido de €, eur, euro ou espaço)
    const amountMatch = s.match(/(\d+([.,]\d{1,2})?)\s*(€|eur|euro|reais)?/);
    if (amountMatch) {
      result.amount = amountMatch[1].replace(",", ".");
    }

    // 3. Data (Relativa)
    const now = new Date();
    if (s.includes("ontem")) {
      now.setDate(now.getDate() - 1);
      result.date = now.toISOString().slice(0, 10);
    } else if (s.includes("anteontem")) {
      now.setDate(now.getDate() - 2);
      result.date = now.toISOString().slice(0, 10);
    } else if (s.includes("amanhã")) {
      now.setDate(now.getDate() + 1);
      result.date = now.toISOString().slice(0, 10);
    }
    
    // Suporte "dia X"
    const dayMatch = s.match(/dia\s+(\d{1,2})/);
    if (dayMatch) {
      const d = parseInt(dayMatch[1]);
      if (d > 0 && d <= 31) {
        const target = new Date(now.getFullYear(), now.getMonth(), d);
        result.date = target.toISOString().slice(0, 10);
      }
    }

    // 4. Descrição / Sujeito
    // Remove o valor e palavras de ligação
    let clean = s.replace(amountMatch ? amountMatch[0] : "", "");
    clean = clean.replace(/\b(gastei|paguei|recebi|ganhei|ontem|hoje|amanhã|dia\s+\d+|no|na|em|de|com|um|uma|euros?|eur|€)\b/g, " ");
    result.description = clean.trim().replace(/\s+/g, " ");
    result.subject = result.description.split(" ")[0]; // Primeira palavra para keyword match

    return result;
  }

  /**
   * Match category by traversing the UI options (Regra 3)
   * Agora suporta Pai e Filho para Despesas
   */
  async function matchCategory(subject, type) {
    if (!subject) return;
    const kind = type.toLowerCase();
    
    try {
      // 1. Procurar na BD para ter a hierarquia completa
      const { data: allCats, error } = await sb
        .from("categories")
        .select("id, name, parent_id")
        .eq("kind", kind);
      
      if (error || !allCats) return;

      const coll = new Intl.Collator("pt-PT", { sensitivity: "base" });
      
      // Tentar match exato ou parcial
      const match = allCats.find(c => 
        coll.compare(c.name, subject) === 0 || 
        c.name.toLowerCase().includes(subject.toLowerCase())
      );

      if (!match) return;

      if (kind === "expense") {
        const parentSelect = $("cat-parent");
        const childSelect = $("cat-child");
        if (!parentSelect) return;

        if (match.parent_id) {
          // É uma subcategoria (Filho)
          parentSelect.value = match.parent_id;
          parentSelect.dispatchEvent(new Event("change"));
          
          // Esperar um pouco para a subcategoria carregar (async)
          // No nova.js original, $("cat-parent").onchange é async
          // Vamos Poll ou simplesmente esperar
          for(let i=0; i<10; i++) {
            await new Promise(r => setTimeout(r, 100));
            const foundChild = Array.from(childSelect.options).find(o => o.value === match.id);
            if (foundChild) {
              childSelect.value = match.id;
              childSelect.dispatchEvent(new Event("change"));
              break;
            }
          }
        } else {
          // É uma categoria principal (Pai)
          parentSelect.value = match.id;
          parentSelect.dispatchEvent(new Event("change"));
        }
      } else {
        // Income / Savings
        const legacySelect = $("tx-category");
        if (!legacySelect) return;
        legacySelect.value = match.id;
        legacySelect.dispatchEvent(new Event("change"));
      }
    } catch (e) {
      console.warn("Match category failed:", e);
    }
  }
}
