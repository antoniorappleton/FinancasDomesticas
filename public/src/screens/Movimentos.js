import { money, ptDate } from "../lib/helpers.js";
import { repo } from "../lib/repo.js";
import { loadTheme } from "../lib/theme.js";

// Badges UI helpers (simple enough to keep here or move to a ui-helper if reused elsewhere)
const typeBadge = (code) => {
  const map = {
    INCOME: {
      label: "Receita",
      style: "background:#ecfdf5;color:#065f46;border:1px solid #d1fae5",
    },
    EXPENSE: {
      label: "Despesa",
      style: "background:#fef2f2;color:#7f1d1d;border:1px solid #fee2e2",
    },
    SAVINGS: {
      label: "Poupança",
      style: "background:#eff6ff;color:#1e3a8a;border:1px solid #dbeafe",
    },
  };
  if (map[code]) {
    return `<span class="badge" style="${map[code].style}">${map[code].label}</span>`;
  }
  if (code?.startsWith("TRANSFER"))
    return `<span class="badge">Transferência</span>`;
  return `<span class="badge">Outro</span>`;
};

const statusBadge = (name_pt) => {
  const done = name_pt?.toLowerCase().startsWith("conclu");
  const style = done
    ? "background:#ecfdf5;color:#065f46;border:1px solid #d1fae5"
    : "background:#f1f5f9;color:#334155;border:1px solid #e2e8f0";
  return `<span class="badge" style="${style}">${name_pt || "-"}</span>`;
};

export async function init(ctx = {}) {
  const sb = window.sb;
  if (sb) await loadTheme(sb);
  const outlet = ctx.outlet || document.getElementById("outlet");
  const qs = (sel) => outlet?.querySelector(sel) || document.querySelector(sel);

  const dom = {
    tbody: qs("#tx-tbody"),
    summary: qs("#tx-summary"),
    fltSearch: qs("#flt-search"),
    fltType: qs("#flt-type"),
    fltStatus: qs("#flt-status"),
    fltMonth: qs("#flt-month"),
    btnRefresh: qs("#btn-refresh"),
    btnMore: qs("#btn-load-more"),
    modal: qs("#tx-edit-modal"),
    ed: {
      date: qs("#ed-date"),
      amount: qs("#ed-amount"),
      account: qs("#ed-account"),
      regularity: qs("#ed-regularity"),
      method: qs("#ed-method"),
      status: qs("#ed-status"),
      type: qs("#ed-type"),
      category: qs("#ed-category"),
      desc: qs("#ed-desc"),
      loc: qs("#ed-loc"),
      notes: qs("#ed-notes"),
      nature: qs("#ed-nature"),
      save: qs("#ed-save"),
      del: qs("#ed-delete"),
      cancel: qs("#ed-cancel"),
      meta: qs("#tx-edit-meta"),
      hint: qs("#ed-hint"),
    },
  };

  if (!dom.tbody || !dom.modal) {
    (outlet || document.body).innerHTML = `
      <section class="card">
        <strong>Erro ao carregar o ecrã.</strong><br>
        Faltam elementos no HTML.
      </section>`;
    return;
  }

  const PAGE_SIZE = 30;
  let page = 0;
  let all = [];
  let filtered = [];

  // Cache de categorias para display (id -> label)
  const categoriesMap = new Map();

  async function ensureCategoriesLoaded() {
    if (categoriesMap.size) return;
    try {
      const cats = await repo.refs.allCategories();
      const parents = new Map(
        cats.filter((c) => !c.parent_id).map((c) => [c.id, c.name]),
      );
      cats.forEach((c) => {
        const label = c.parent_id
          ? `${parents.get(c.parent_id) || "?"} > ${c.name}`
          : c.name;
        categoriesMap.set(c.id, { name: c.name, label });
      });
    } catch (e) {
      console.error("Erro ao carregar categorias:", e);
    }
  }

  function categoryLabel(id) {
    if (!id) return "(Sem categoria)";
    return categoriesMap.get(id)?.label || "(Sem categoria)";
  }

  async function fillStatusFilter() {
    try {
      const data = await repo.refs.statuses();
      dom.fltStatus.innerHTML =
        `<option value="all">Todos os status</option>` +
        data
          .map((s) => `<option value="${s.name_pt}">${s.name_pt}</option>`)
          .join("");
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchPage(reset = false) {
    if (reset) {
      page = 0;
      all = [];
      dom.tbody.innerHTML = "";
    }

    try {
      // Carregar categorias se necessário para exibir nomes corretos
      await ensureCategoriesLoaded();

      const data = await repo.transactions.list({
        page,
        pageSize: PAGE_SIZE,
        month: dom.fltMonth?.value || null,
      });

      if (!data || !data.length) {
        if (reset) {
          dom.tbody.innerHTML = `<tr><td colspan="8" style="padding:12px;color:#475569">Nenhuma transação encontrada.</td></tr>`;
          dom.summary.textContent = "0 transações";
        }
        return; // Fim da lista
      }

      const rows = data.map((tx) => ({
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
        category_path: categoryLabel(tx.category_id),
      }));

      all = all.concat(rows);
      page++;
    } catch (error) {
      dom.tbody.innerHTML = `<tr><td colspan="8" style="padding:12px;color:#991b1b">Erro: ${error.message}</td></tr>`;
    }
  }

  function render() {
    const q = (dom.fltSearch?.value || "").trim().toLowerCase();
    const t = dom.fltType?.value || "all";
    const s = dom.fltStatus?.value || "all";

    filtered = all.filter((r) => {
      const typeOK = t === "all" || r.type_code === t;
      const statusOK = s === "all" || r.status_name === s;
      const qOK =
        !q ||
        r.description.toLowerCase().includes(q) ||
        r.category_path.toLowerCase().includes(q) ||
        (r.location || "").toLowerCase().includes(q) ||
        (r.account || "").toLowerCase().includes(q);
      return typeOK && statusOK && qOK;
    });

    if (!filtered.length) {
      dom.tbody.innerHTML = `<tr><td colspan="8" style="padding:12px;color:#475569">Nenhuma transação corresponde aos filtros.</td></tr>`;
      dom.summary.textContent = `Mostrando 0 de ${all.length}`;
      return;
    }

    dom.tbody.innerHTML = filtered
      .map((r) => {
        // Lógica visual de cores
        const val = r.type_code === "EXPENSE" ? -r.amount : r.amount;
        const color =
          r.type_code === "INCOME"
            ? "#16a34a"
            : r.type_code === "EXPENSE"
              ? "#ef4444"
              : "#2563eb";

        return `
      <tr class="tx-row" data-id="${r.id}" data-type="${r.type_code || ""}" style="cursor:pointer">
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">${ptDate(r.date)}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">${typeBadge(r.type_code)}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb);text-align:right">
          <span style="color:${color};font-weight:700">${money(val)}</span>
        </td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">${r.category_path}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">${r.description || "-"}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">
          <span class="badge" style="background:#fff;border:1px solid #e5e7eb">${r.account || "-"}</span>
        </td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">${statusBadge(r.status_name)}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border,#e5e7eb)">${r.location || "-"}</td>
      </tr>`;
      })
      .join("");

    dom.summary.textContent = `Mostrando ${filtered.length} de ${all.length} transações`;
  }

  // --------- Edit modal ---------
  function fillSelect(el, rows, label, value = "id") {
    if (!el) return;
    el.innerHTML = (rows || [])
      .map((r) => `<option value="${r[value]}">${r[label]}</option>`)
      .join("");
  }

  async function loadCategoriesForType(typeCode, selectedId) {
    const kindMap = {
      INCOME: "income",
      EXPENSE: "expense",
      SAVINGS: "savings",
    };
    const kind = kindMap[typeCode];
    if (!kind) {
      fillSelect(dom.ed.category, [], "label");
      return;
    }
    try {
      const rows = await repo.refs.categories(kind);
      fillSelect(dom.ed.category, rows, "label");
      if (selectedId) dom.ed.category.value = selectedId;
    } catch (e) {
      console.error(e);
      fillSelect(dom.ed.category, [], "label");
    }
  }

  function openModal() {
    dom.modal?.removeAttribute("hidden");
  }
  function closeModal() {
    dom.modal?.setAttribute("hidden", "");
  }

  async function openEdit(id) {
    try {
      // Paralelizar carregamento de refs
      const [accs, regs, methods, statuses, types, tx] = await Promise.all([
        repo.accounts.list(),
        repo.refs.regularities(),
        repo.refs.paymentMethods(),
        repo.refs.statuses(),
        repo.refs.transactionTypes(),
        repo.transactions.getById(id),
      ]);

      fillSelect(dom.ed.account, accs, "name");
      fillSelect(dom.ed.regularity, regs, "name_pt");
      fillSelect(dom.ed.method, methods, "name_pt");
      fillSelect(dom.ed.status, statuses, "name_pt");
      fillSelect(dom.ed.type, types, "name_pt");

      dom.ed.date.value = tx.date;
      dom.ed.amount.value = Number(tx.amount || 0).toFixed(2);
      dom.ed.account.value = tx.account_id || "";
      dom.ed.regularity.value = tx.regularity_id || "";
      dom.ed.method.value = tx.payment_method_id || "";
      dom.ed.status.value = tx.status_id || "";
      dom.ed.type.value = tx.type_id || "";
      dom.ed.desc.value = tx.description || "";
      dom.ed.loc.value = tx.location || "";
      dom.ed.notes.value = tx.notes || "";
      dom.ed.nature.value = tx.expense_nature || "";

      // Carregar categorias compatíveis
      const tcode = tx.transaction_types?.code;
      await loadCategoriesForType(tcode, tx.category_id);

      const isTransfer = tcode && tcode.startsWith("TRANSFER");
      dom.ed.hint.textContent = isTransfer
        ? '<svg width="14" height="14" style="vertical-align: middle; margin-right: 4px;"><use href="#i-info"/></svg> Transferência: edição/remoção bloqueadas aqui.'
        : "";
      dom.ed.save.disabled = !!isTransfer;
      dom.ed.del.disabled = !!isTransfer;

      dom.ed.meta.textContent = `${ptDate(tx.date)} • ${tcode}`;

      dom.ed.save.onclick = async () => {
        try {
          const upd = {
            date: dom.ed.date.value,
            amount: Number(dom.ed.amount.value || 0),
            account_id: dom.ed.account.value || null,
            regularity_id: dom.ed.regularity.value
              ? Number(dom.ed.regularity.value)
              : null,
            payment_method_id: dom.ed.method.value
              ? Number(dom.ed.method.value)
              : null,
            status_id: dom.ed.status.value ? Number(dom.ed.status.value) : null,
            category_id: dom.ed.category.value || null,
            description: dom.ed.desc.value || null,
            location: dom.ed.loc.value || null,
            notes: dom.ed.notes.value || null,
            expense_nature: dom.ed.nature.value || null,
          };
          if (!(upd.amount > 0)) throw new Error("Valor inválido.");

          await repo.transactions.update(id, upd);
          await fetchPage(true);
          render();
          closeModal();
        } catch (e) {
          alert("Erro a guardar: " + (e.message || e));
        }
      };

      dom.ed.del.onclick = async () => {
        if (!confirm("Eliminar este registo?")) return;
        try {
          await repo.transactions.delete(id);
          await fetchPage(true);
          render();
          closeModal();
        } catch (e) {
          alert("Erro a eliminar: " + (e.message || e));
        }
      };

      dom.ed.cancel.onclick = closeModal;
      openModal();
    } catch (e) {
      console.error(e);
      alert("Erro ao abrir edição: " + e.message);
    }
  }

  // --------- Eventos ---------
  dom.btnRefresh?.addEventListener("click", () => {
    fetchPage(true).then(render);
  });
  dom.btnMore?.addEventListener("click", () => {
    fetchPage(false).then(render);
  });
  dom.fltSearch?.addEventListener("input", render);
  dom.fltType?.addEventListener("change", render);
  dom.fltStatus?.addEventListener("change", () => {
    fetchPage(true).then(render);
  });
  dom.fltMonth?.addEventListener("change", () => {
    fetchPage(true).then(render);
  });

  dom.modal?.addEventListener("click", (ev) => {
    if (ev.target?.hasAttribute?.("data-close")) closeModal();
  });

  dom.tbody?.addEventListener("click", (ev) => {
    const tr = ev.target.closest?.("tr.tx-row");
    if (!tr) return;
    const type = tr.dataset.type || "";
    if (type.startsWith("TRANSFER")) {
      alert("Editar transferências aqui está bloqueado.");
      return;
    }
    openEdit(tr.dataset.id);
  });

  // Init
  await fillStatusFilter();
  await fetchPage(true);
  render();

  // Check for Report Deep Link
  const hash = window.location.hash; // #/transactions?report=daily
  if (hash.includes("?report=")) {
    const params = new URLSearchParams(hash.split("?")[1]);
    const reportType = params.get("report"); // daily | weekly
    
    if (reportType) {
      showReportModal(reportType);
    }
  }

  async function showReportModal(type) {
    const modal = document.getElementById("report-modal");
    if (!modal) return;

    const ui = {
      title: modal.querySelector("#report-title"),
      date: modal.querySelector("#report-date"),
      total: modal.querySelector("#report-total"),
      list: modal.querySelector("#report-list"),
    };

    ui.list.innerHTML = `<li style="text-align:center;padding:20px;">A carregar...</li>`;
    ui.total.textContent = "--";
    modal.removeAttribute("hidden");

    try {
      const today = new Date();
      const fmt = new Intl.DateTimeFormat("pt-PT").format;
      const ymd = (d) => d.toISOString().slice(0, 10);
      const { data: { user } } = await sb.auth.getUser();
      const uid = user.id;
      const sumTxs = (txs) => (txs || []).reduce((a, t) => a + Number(t.amount || 0), 0);

      // Helper: fetch expenses for a date range
      const fetchExpenses = async (from, to, withDesc = false) => {
        const { data, error } = await sb.from("transactions")
          .select(withDesc ? "amount, description, date, transaction_types!inner(code)" : "amount, transaction_types!inner(code)")
          .eq("user_id", uid)
          .eq("transaction_types.code", "EXPENSE")
          .gte("date", from).lte("date", to)
          .order("amount", { ascending: false });
        if (error) throw error;
        return data || [];
      };

      if (type === "daily") {
        ui.title.textContent = "Relatório Diário";
        ui.date.textContent = fmt(today);
        const todayStr = ymd(today);

        const prev30Start = new Date(today); prev30Start.setDate(today.getDate() - 30);
        const prev30End = new Date(today); prev30End.setDate(today.getDate() - 1);

        const [todayTxs, last30Txs] = await Promise.all([
          fetchExpenses(todayStr, todayStr, true),
          fetchExpenses(ymd(prev30Start), ymd(prev30End)),
        ]);

        const totalHoje = sumTxs(todayTxs);
        const avgDiario = sumTxs(last30Txs) / 30;
        const diff = totalHoje - avgDiario;
        const diffColor = diff <= 0 ? "#16a34a" : "#ef4444";
        const diffSign = diff >= 0 ? "+" : "";

        ui.total.textContent = money(totalHoje);

        const comparisonHtml = `
          <div style="margin-bottom:14px;padding:10px 12px;background:var(--bg-body);border-radius:8px;border-left:3px solid ${diffColor};">
            <div style="font-size:0.8rem;color:var(--text-muted);">Comparação vs média diária (30d)</div>
            <div style="font-weight:700;color:${diffColor};margin-top:2px;">${diffSign}${money(diff)} (média: ${money(avgDiario)})</div>
          </div>`;

        const listHtml = todayTxs.length === 0
          ? `<li style="color:var(--text-muted);padding:10px;text-align:center;">Sem despesas hoje.</li>`
          : todayTxs.slice(0, 10).map(t => `
              <li style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg-body);border-radius:6px;">
                <div style="font-weight:500;">${t.description || "Sem descrição"}
                  <div style="font-size:0.75rem;color:var(--text-muted);">${ptDate(t.date)}</div>
                </div>
                <div style="font-weight:700;color:#ef4444;">${money(t.amount)}</div>
              </li>`).join("");

        ui.list.innerHTML = comparisonHtml + `<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;">${listHtml}</ul>`;

      } else {
        ui.title.textContent = "Relatório Semanal";
        const weekStart = new Date(today); weekStart.setDate(today.getDate() - 7);
        const prevWeekStart = new Date(today); prevWeekStart.setDate(today.getDate() - 14);
        const prevWeekEnd = new Date(today); prevWeekEnd.setDate(today.getDate() - 8);
        ui.date.textContent = `${fmt(weekStart)} — ${fmt(today)}`;

        const [thisWeekTxs, prevWeekTxs] = await Promise.all([
          fetchExpenses(ymd(weekStart), ymd(today), true),
          fetchExpenses(ymd(prevWeekStart), ymd(prevWeekEnd)),
        ]);

        const totalSemana = sumTxs(thisWeekTxs);
        const totalPrevSemana = sumTxs(prevWeekTxs);
        ui.total.textContent = money(totalSemana);

        let pctHtml = "";
        if (totalPrevSemana > 0) {
          const pct = ((totalSemana - totalPrevSemana) / totalPrevSemana) * 100;
          const pctColor = pct <= 0 ? "#16a34a" : "#ef4444";
          const pctSign = pct >= 0 ? "+" : "";
          pctHtml = `
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span style="color:var(--text-muted);font-size:0.85rem;">vs semana passada</span>
              <span style="font-weight:700;color:${pctColor};">${pctSign}${pct.toFixed(1)}% (${money(totalPrevSemana)})</span>
            </div>`;
        }

        // Projection: extrapolate based on elapsed days of the week
        const elapsedDays = Math.max(1, (today.getDay() + 6) % 7 + 1);
        const projected = (totalSemana / elapsedDays) * 7;
        const projColor = projected > (totalPrevSemana || totalSemana) ? "#ef4444" : "#16a34a";
        const projHtml = `
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--text-muted);font-size:0.85rem;">Projeção semana completa</span>
            <span style="font-weight:700;color:${projColor};">${money(projected)}</span>
          </div>`;

        const comparisonHtml = `
          <div style="margin-bottom:14px;padding:10px 12px;background:var(--bg-body);border-radius:8px;border:1px solid var(--border);">
            ${pctHtml}${projHtml}
          </div>`;

        const listHtml = thisWeekTxs.length === 0
          ? `<li style="color:var(--text-muted);padding:10px;text-align:center;">Sem despesas esta semana.</li>`
          : thisWeekTxs.slice(0, 10).map(t => `
              <li style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg-body);border-radius:6px;">
                <div style="font-weight:500;">${t.description || "Sem descrição"}
                  <div style="font-size:0.75rem;color:var(--text-muted);">${ptDate(t.date)}</div>
                </div>
                <div style="font-weight:700;color:#ef4444;">${money(t.amount)}</div>
              </li>`).join("");

        ui.list.innerHTML = comparisonHtml + `<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;">${listHtml}</ul>`;
      }

    } catch (e) {
      console.error(e);
      ui.list.innerHTML = `<li style="color:red">Erro ao carregar relatório: ${e.message}</li>`;
    }
  }

  // Bind close event for report modal
  document.getElementById("report-modal")?.addEventListener("click", (ev) => {
     if (ev.target?.hasAttribute?.("data-close")) {
       document.getElementById("report-modal").setAttribute("hidden", "");
       // Limpar a query da URL para não reabrir ao dar refresh
       // history.replaceState(null, "", "#/transactions");
     }
  });
}
