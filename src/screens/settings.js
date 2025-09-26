// src/screens/settings.js
export async function init({ sb, outlet } = {}) {
  sb = sb || window.sb;
  outlet = outlet || document.getElementById("outlet");

  // ---------- CONFIGURÁVEL PELO DEV ----------
  const REPORT_META = {
    brand: "Wisebudget365",
    pdfAuthor: "António Appleton",
    titles: {
      monthly: "Relatório Financeiro — mês de {MMMM} de {YYYY}",
      annual: "Relatório Financeiro — Ano {YYYY}",
    },
    headerLeft: "Relatório Financeiro",
    headerRight: "{SCOPE_LABEL}",
    footerLeft: "Gerado automaticamente pelo Home Finance",
    footerRight: "{DATE}  •  Página {PAGE}/{PAGES}",
  };
  // Onde editar os textos/títulos: ↑ aqui em cima

  // ---------- UTIL ----------
  const $ = (sel) => outlet.querySelector(sel);
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const yyyyMm = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const fmtMoney = (n) =>
    "€ " +
    Number(n || 0).toLocaleString("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  function firstDayYMD(y, m) {
    return new Date(y, m, 1).toISOString().slice(0, 10);
  }
  function nextMonthYMD(y, m) {
    return new Date(y, m + 1, 1).toISOString().slice(0, 10);
  }
  function rangeFor(scope, year, month0) {
    if (scope === "annual")
      return { from: `${year}-01-01`, to: `${year + 1}-01-01` };
    return { from: firstDayYMD(year, month0), to: nextMonthYMD(year, month0) };
  }

  async function ensureScript(src) {
    if ([...document.scripts].some((s) => s.src.includes(src))) return;
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  async function ensureChartJs() {
    if (window.Chart) return;
    await ensureScript(
      "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
    );
  }
  async function ensureJsPdf() {
    if (!window.jspdf)
      await ensureScript(
        "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
      );
    if (!window.jspdf?.jsPDF) throw new Error("jsPDF não carregado");
    // autotable opcional (para tabelas)
    if (!window.jspdf?.autoTable)
      await ensureScript(
        "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"
      );
  }

  // ======================================================================
  // 1) IMPORTAÇÃO CSV  (mantém funcionalidade existente)
  // ======================================================================
  const log = (msg) => {
    const el = $("#imp-log");
    if (el) el.textContent += (el.textContent ? "\n" : "") + msg;
  };
  const info = (msg) => {
    const el = $("#imp-info");
    if (el) el.textContent = msg || "";
  };

  const fileEl = $("#imp-file");
  const btnParse = $("#imp-parse");
  const btnImport = $("#imp-import");
  const preview = $("#imp-preview");
  const progress = $("#imp-progress");

  // helpers import
  const normalizeHeader = (h) =>
    String(h || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[ãâáàä]/g, "a")
      .replace(/[êéèë]/g, "e")
      .replace(/[îíìï]/g, "i")
      .replace(/[õôóòö]/g, "o")
      .replace(/[ûúùü]/g, "u")
      .replace(/ç/g, "c");

  const normalize = (v) => {
    if (v == null) return "";
    let t = String(v).trim();
    if (/^(null|nil|na|—|-|)$/i.test(t)) return "";
    return t.replace(/^"(.*)"$/, "$1").replace(/""/g, '"');
  };

  const detectDelimiter = (text) => {
    const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
    const candidates = [",", ";", "\t", "|"];
    const counts = candidates.map(
      (d) =>
        (
          sample.match(new RegExp(`\\${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`, "g")) ||
          []
        ).length
    );
    return candidates[counts.indexOf(Math.max(...counts))] || ";";
  };
  const splitCSVLine = (line, delim) => {
    const re = new RegExp(`${delim}(?=(?:[^"]*"[^"]*")*[^"]*$)`);
    return line
      .split(re)
      .map((s) => s.replace(/^"(.*)"$/, "$1").replace(/""/g, '"'));
  };
  const parseAmount = (s) => {
    s = normalize(s);
    if (!s) return NaN;
    let t = s
      .replace(/[€\s]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const v = Number(t);
    return isFinite(v) ? v : NaN;
  };
  const toISO = (s) => {
    s = normalize(s);
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  };

  // dicionários
  const [
    { data: types },
    { data: regs },
    { data: pms },
    { data: sts },
    { data: accounts },
    { data: cats },
  ] = await Promise.all([
    sb.from("transaction_types").select("id,code,name_pt"),
    sb.from("regularities").select("id,code,name_pt"),
    sb.from("payment_methods").select("id,code,name_pt"),
    sb.from("statuses").select("id,code,name_pt"),
    sb.from("accounts").select("id,name").order("name"),
    sb.from("categories").select("id,name,parent_id"),
  ]);

  const TYPE_BY_LABEL = new Map();
  (types || []).forEach((t) => {
    TYPE_BY_LABEL.set(normalizeHeader(t.code), t.id);
    TYPE_BY_LABEL.set(normalizeHeader(t.name_pt), t.id);
  });
  const STATUS_BY_LABEL = new Map();
  (sts || []).forEach((s) => {
    STATUS_BY_LABEL.set(normalizeHeader(s.code), s.id);
    STATUS_BY_LABEL.set(normalizeHeader(s.name_pt), s.id);
  });
  const PM_BY_LABEL = new Map();
  (pms || []).forEach((p) => {
    PM_BY_LABEL.set(normalizeHeader(p.code), p.id);
    PM_BY_LABEL.set(normalizeHeader(p.name_pt), p.id);
  });
  const REG_BY_LABEL = new Map();
  (regs || []).forEach((r) => {
    REG_BY_LABEL.set(normalizeHeader(r.code), r.id);
    REG_BY_LABEL.set(normalizeHeader(r.name_pt), r.id);
  });
  const ACC_BY_NAME = new Map(
    (accounts || []).map((a) => [normalizeHeader(a.name), a.id])
  );
  const catById = new Map((cats || []).map((c) => [c.id, c]));
  const CAT_BY_PATH = new Map();
  (cats || []).forEach((c) => {
    if (c.parent_id) {
      const p = catById.get(c.parent_id);
      if (p) CAT_BY_PATH.set(normalizeHeader(`${p.name} > ${c.name}`), c.id);
    }
    CAT_BY_PATH.set(normalizeHeader(c.name), c.id);
  });

  const ALIASES = {
    date: ["date", "data"],
    amount: ["amount", "valor", "montante", "value"],
    type: ["type", "tipo", "type_code", "tipo_codigo", "tipo_code"],
    account: [
      "account",
      "conta",
      "account_name",
      "nome_conta",
      "conta_nome",
      "accountid",
      "account_id",
    ],
    category: [
      "category",
      "categoria",
      "categoria_path",
      "category_path",
      "categoria pai > filho",
      "pai > filho",
    ],
    description: ["description", "descricao", "descrição", "desc"],
    payment_method: [
      "payment_method",
      "metodo",
      "método",
      "payment_method_code",
      "metodo_code",
      "metodo_codigo",
    ],
    status: ["status", "estado", "status_code", "estado_code", "estado_codigo"],
    regularity: [
      "regularity",
      "regularidade",
      "regularity_code",
      "regularidade_code",
      "regularidade_codigo",
    ],
    notes: ["notes", "notas"],
    location: ["location", "local", "localizacao", "localização"],
    currency: ["currency", "moeda"],
    expense_nature: [
      "expense_nature",
      "natureza_despesa",
      "fixa_variavel",
      "fixa/variavel",
    ],
  };
  const pick = (row, key) => {
    const keys = ALIASES[key] || [key];
    for (const k of keys) {
      const v = normalize(row[normalizeHeader(k)]);
      if (v) return v;
    }
    return "";
  };

  let mappedRows = [];
  btnParse?.addEventListener("click", async () => {
    $("#imp-log").textContent = "";
    info("");
    mappedRows = [];
    btnImport.disabled = true;
    preview.innerHTML = "";
    progress.hidden = true;
    const file = fileEl?.files?.[0];
    if (!file) {
      info("Escolhe um ficheiro .csv");
      return;
    }
    const rawText = await file.text();
    const text = rawText.replace(/^\uFEFF/, "");
    const delim = detectDelimiter(text);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      info("CSV sem linhas suficientes.");
      return;
    }
    const headers = splitCSVLine(lines[0], delim).map(normalizeHeader);
    log(
      `Delimitador detetado: "${
        delim === "\t" ? "\\t" : delim
      }" | Cabeçalhos: ${headers.join(" | ")}`
    );

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCSVLine(lines[i], delim);
      const o = {};
      headers.forEach((h, idx) => (o[h] = cols[idx] ?? ""));
      rows.push(o);
    }

    const userId = (await sb.auth.getUser()).data?.user?.id || null;
    const errors = [];
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const dateISO = toISO(pick(r, "date"));
      if (!dateISO) {
        errors.push(`L${i + 2}: data inválida "${pick(r, "date")}"`);
        continue;
      }
      let amountNum = parseAmount(pick(r, "amount"));
      if (isNaN(amountNum)) {
        errors.push(`L${i + 2}: valor inválido "${pick(r, "amount")}"`);
        continue;
      }
      const sign = amountNum < 0 ? -1 : 1;
      amountNum = Math.abs(amountNum);
      const accName = pick(r, "account");
      const accountId = ACC_BY_NAME.get(normalizeHeader(accName));
      if (!accountId) {
        errors.push(`L${i + 2}: conta não encontrada "${accName}"`);
        continue;
      }

      const typeLabel = pick(r, "type");
      let typeId = TYPE_BY_LABEL.get(normalizeHeader(typeLabel)) || null;
      const catRaw = pick(r, "category");
      let categoryId = null;
      if (catRaw) categoryId = CAT_BY_PATH.get(normalizeHeader(catRaw)) || null;
      if (!typeId) {
        if (/poupan/.test(normalizeHeader(catRaw)))
          typeId = TYPE_BY_LABEL.get("savings");
        else if (sign < 0) typeId = TYPE_BY_LABEL.get("expense");
        else if (sign > 0) typeId = TYPE_BY_LABEL.get("income");
      }
      if (!typeId) {
        errors.push(`L${i + 2}: tipo inválido "${typeLabel}"`);
        continue;
      }

      const statusId =
        STATUS_BY_LABEL.get(normalizeHeader(pick(r, "status"))) ||
        STATUS_BY_LABEL.get("done") ||
        null;
      const paymentMethodId =
        PM_BY_LABEL.get(normalizeHeader(pick(r, "payment_method"))) || null;
      const regularityId =
        REG_BY_LABEL.get(normalizeHeader(pick(r, "regularity"))) || null;

      out.push({
        user_id: userId,
        type_id: typeId,
        regularity_id: regularityId,
        account_id: accountId,
        category_id: categoryId,
        payment_method_id: paymentMethodId,
        status_id: statusId,
        date: dateISO,
        amount: amountNum,
        description: pick(r, "description") || null,
        location: pick(r, "location") || null,
        notes: pick(r, "notes") || null,
        currency: pick(r, "currency") || "EUR",
      });
    }

    // deduplicar (data|valor|tipo|conta|categoria|descrição)
    const dedupe = new Map();
    for (const p of out) {
      const key = [
        p.date,
        Number(p.amount).toFixed(2),
        p.type_id,
        p.account_id,
        p.category_id || "_",
        (p.description || "").trim(),
      ].join("|");
      if (!dedupe.has(key)) dedupe.set(key, p);
    }
    const before = out.length,
      after = dedupe.size;
    if (before !== after)
      log(`⚠️ Deduplicadas ${before - after} linhas iguais no CSV.`);

    mappedRows = [...dedupe.values()];

    // preview
    const head = ["Data", "Valor", "Tipo/Conta", "Categoria", "Descrição"];
    const html = [
      `<table class="table">`,
      `<thead><tr>${head
        .map((h) => `<th>${h}</th>`)
        .join("")}</tr></thead><tbody>`,
      ...mappedRows.slice(0, 10).map((p) => {
        const tName =
          (types || []).find((x) => x.id === p.type_id)?.name_pt ||
          (types || []).find((x) => x.id === p.type_id)?.code ||
          "";
        const acc =
          (accounts || []).find((a) => a.id === p.account_id)?.name || "";
        const cat = p.category_id ? catById.get(p.category_id)?.name : "(sem)";
        return `<tr>
          <td>${p.date}</td><td>${fmtMoney(
          p.amount
        )}</td><td>${tName} / ${acc}</td>
          <td>${cat}</td><td>${p.description || ""}</td></tr>`;
      }),
      `</tbody></table>`,
    ].join("");
    preview.innerHTML = html;

    info(`Registos válidos: ${mappedRows.length} / ${rows.length}.`);
    if (errors.length)
      log(
        "Avisos:\n- " +
          errors.slice(0, 10).join("\n- ") +
          (errors.length > 10 ? `\n(+${errors.length - 10} mais…)` : "")
      );
    btnImport.disabled = mappedRows.length === 0;
  });

  btnImport?.addEventListener("click", async () => {
    if (!mappedRows.length) {
      info("Nada para importar. Faz primeiro a pré-visualização.");
      return;
    }
    progress.hidden = false;
    progress.value = 0;
    btnImport.disabled = true;
    btnParse.disabled = true;
    fileEl.disabled = true;
    $("#imp-log").textContent = "";
    info("A importar…");
    try {
      const CHUNK = 200;
      for (let i = 0; i < mappedRows.length; i += CHUNK) {
        const batch = mappedRows.slice(i, i + CHUNK);
        const { error } = await sb.from("transactions").insert(batch);
        if (error) throw error;
        progress.value = Math.round(
          ((i + batch.length) / mappedRows.length) * 100
        );
      }
      info(`✅ Importação concluída: ${mappedRows.length} registos inseridos.`);
      log("Concluído.");
    } catch (e) {
      info("❌ Falha na importação.");
      log(e?.message || String(e));
    } finally {
      btnImport.disabled = false;
      btnParse.disabled = false;
      fileEl.disabled = false;
      setTimeout(() => (progress.hidden = true), 1200);
    }
  });

  // ======================================================================
  // 2) RELATÓRIOS (modal + preview + PDF)
  // ======================================================================
  await ensureChartJs();

  const bd = $("#report-backdrop");
  const md = $("#report-modal");
  const btOpen = $("#btn-report-open");
  const btClose = $("#report-close");
  const btPrev = $("#btn-report-preview");
  const btPdf = $("#btn-report-pdf");
  const selYear = $("#rep-year");
  const inpMonth = $("#rep-month");
  const previewBox = $("#report-preview");

  // preencher ano/mês
  const thisYear = now.getFullYear();
  selYear.innerHTML = Array.from({ length: 6 })
    .map((_, i) => {
      const y = thisYear - 4 + i;
      return `<option value="${y}" ${
        y === thisYear ? "selected" : ""
      }>${y}</option>`;
    })
    .join("");
  inpMonth.value = yyyyMm(now);

  function openModal() {
    bd.classList.remove("hidden");
    md.classList.remove("hidden");
  }
  function closeModal() {
    bd.classList.add("hidden");
    md.classList.add("hidden");
  }

  btOpen?.addEventListener("click", openModal);
  btClose?.addEventListener("click", closeModal);
  bd?.addEventListener("click", closeModal);

  // classificador fixa/variável (fallback se não existirem colunas dedicadas)
  const FIXED_HINTS = [
    "renda",
    "utilidades",
    "tv",
    "internet",
    "seguro",
    "credito",
    "crédito",
    "mensalidade",
    "assinatura",
    "telemovel",
    "telemóvel",
    "empregada",
    "iuc",
    "nos",
  ];
  const looksFixed = (name) =>
    FIXED_HINTS.some((h) => (name || "").toLowerCase().includes(h));

  // cria canvas “on-demand” (para usar no preview e export PDF)
  function makeCanvas(id, h = 280) {
    const c = document.createElement("canvas");
    c.id = id;
    c.height = h;
    c.style.height = h + "px";
    return c;
  }

  function section(title, inner) {
    return `<div class="r-card"><h4 class="r-title">${title}</h4>${
      inner || ""
    }</div>`;
  }

  async function fetchMonthlySeries(fromYMD) {
    // tenta a view; senão agrupa localmente
    const { data, error } = await sb
      .from("v_monthly_summary")
      .select("month,income,expense,savings,net")
      .gte("month", fromYMD)
      .order("month", { ascending: true });
    if (!error && data)
      return data.map((r) => ({
        month: String(r.month).slice(0, 7),
        income: Number(r.income || 0),
        expense: Number(r.expense || 0),
        savings: Number(r.savings || 0),
        net: Number(r.net || 0),
      }));

    // fallback
    const { data: types } = await sb
      .from("transaction_types")
      .select("id,code");
    const CODE_BY_ID = new Map((types || []).map((t) => [t.id, t.code]));
    const { data: tx } = await sb
      .from("transactions")
      .select("date,amount,type_id")
      .gte("date", fromYMD)
      .order("date", { ascending: true });
    const agg = new Map();
    (tx || []).forEach((r) => {
      const k = String(r.date).slice(0, 7);
      const code = CODE_BY_ID.get(r.type_id);
      const a = Number(r.amount || 0);
      const m = agg.get(k) || { income: 0, expense: 0, savings: 0, net: 0 };
      if (code === "INCOME") {
        m.income += a;
        m.net += a;
      } else if (code === "EXPENSE") {
        m.expense += a;
        m.net -= a;
      } else if (code === "SAVINGS") {
        m.savings += a;
        m.net -= a;
      }
      agg.set(k, m);
    });
    return Array.from(agg.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, m]) => ({ month, ...m }));
  }

  async function buildDataset(scope, year, month0) {
    const { from, to } = rangeFor(scope, year, month0);

    // types map
    const { data: types } = await sb
      .from("transaction_types")
      .select("id,code");
    const CODE_BY_ID = new Map((types || []).map((t) => [t.id, t.code]));

    // despesas p/ categorias (e p/ fixa/variável)
    const { data: rows } = await sb
      .from("transactions")
      .select("date, amount, type_id, category_id, categories(name,parent_id)")
      .gte("date", from)
      .lt("date", to)
      .order("date", { ascending: true });

    // mapa de categorias (Pai > Filho)
    const { data: allCats } = await sb
      .from("categories")
      .select("id,name,parent_id");
    const byId = new Map((allCats || []).map((c) => [c.id, c]));
    const catPath = (cat) => {
      if (!cat) return "(Sem categoria)";
      if (!cat.parent_id) return cat.name;
      const p = byId.get(cat.parent_id);
      return (p?.name ? p.name + " > " : "") + cat.name;
    };

    // KPIs + fix/var + categorias
    let income = 0,
      expense = 0,
      savings = 0,
      net = 0;
    const catAgg = new Map();
    let fixed = 0,
      variable = 0;

    for (const r of rows || []) {
      const code = CODE_BY_ID.get(r.type_id);
      const amt = Number(r.amount || 0);
      if (code === "INCOME") {
        income += amt;
        net += amt;
      } else if (code === "EXPENSE") {
        expense += amt;
        net -= amt;
      } else if (code === "SAVINGS") {
        savings += amt;
        net -= amt;
      }

      if (code === "EXPENSE") {
        const name = catPath(r.categories);
        catAgg.set(name, (catAgg.get(name) || 0) + amt);
        const looks = looksFixed(name);
        if (looks) fixed += amt;
        else variable += amt;
      }
    }

    // top categorias ordenadas
    const catRows = Array.from(catAgg.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // séries (12 meses retroativos para dar contexto no PDF)
    const twelveAgo = new Date(year, (scope === "annual" ? 0 : month0) - 11, 1)
      .toISOString()
      .slice(0, 10);
    const monthly = await fetchMonthlySeries(twelveAgo);

    return {
      from,
      to,
      income,
      expense,
      savings,
      net,
      fixed,
      variable,
      catRows,
      monthly,
    };
  }

  function renderPreviewHTML(scope, year, month0, data) {
    const monthNames = [
      "janeiro",
      "fevereiro",
      "março",
      "abril",
      "maio",
      "junho",
      "julho",
      "agosto",
      "setembro",
      "outubro",
      "novembro",
      "dezembro",
    ];
    // título (só para preview visual)
    const sub =
      scope === "annual" ? `Ano ${year}` : `${monthNames[month0]} de ${year}`;

    const kpis = `
      <div class="r-card">
        <h4 class="r-title">KPIs do período — <span class="muted">${sub}</span></h4>
        <div class="kpi-grid">
          <div class="kpi"><div class="k">Receitas</div><div class="v">${fmtMoney(
            data.income
          )}</div></div>
          <div class="kpi"><div class="k">Despesas</div><div class="v">-${fmtMoney(
            data.expense
          ).replace("€ ", "")}</div></div>
          <div class="kpi"><div class="k">Poupanças</div><div class="v">-${fmtMoney(
            data.savings
          ).replace("€ ", "")}</div></div>
          <div class="kpi"><div class="k">Saldo líquido</div><div class="v">${fmtMoney(
            data.net
          )}</div></div>
        </div>
      </div>`;

    const catTable = `
      <table class="table">
        <thead><tr><th>Categoria</th><th>Total</th></tr></thead>
        <tbody>
          ${data.catRows
            .map(
              (r) => `<tr><td>${r.name}</td><td>${fmtMoney(r.total)}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>`;

    // contêineres de charts (serão instanciados no preview)
    const charts = `
      <div class="grid-2">
        <div class="r-card"><h4 class="r-title">Distribuição de despesas por categorias</h4><div id="wrap-pie"></div></div>
        <div class="r-card"><h4 class="r-title">Fixas vs Variáveis</h4><div id="wrap-donut"></div></div>
      </div>
      <div class="r-card"><h4 class="r-title">Séries mensais</h4><div id="wrap-bars"></div></div>
      <div class="r-card"><h4 class="r-title">Taxas de esforço</h4>
        <table class="table">
          <tbody>
            <tr><td>Fixas / Receita</td><td>${(data.income
              ? (data.fixed / data.income) * 100
              : 0
            ).toFixed(1)}%</td></tr>
            <tr><td>Variáveis / Receita</td><td>${(data.income
              ? (data.variable / data.income) * 100
              : 0
            ).toFixed(1)}%</td></tr>
            <tr><td>Poupança / Receita</td><td>${(data.income
              ? (data.savings / data.income) * 100
              : 0
            ).toFixed(1)}%</td></tr>
          </tbody>
        </table>
      </div>
    `;

    previewBox.innerHTML =
      kpis + section("Análise Detalhada por Categoria", catTable) + charts;

    // cria e anexa canvases
    const pie = makeCanvas("rep-pie", 300);
    const donut = makeCanvas("rep-donut", 300);
    const bars = makeCanvas("rep-bars", 280);
    $("#wrap-pie").appendChild(pie);
    $("#wrap-donut").appendChild(donut);
    $("#wrap-bars").appendChild(bars);

    // charts
    const labels = data.catRows.map((r) => r.name);
    const catTotals = data.catRows.map((r) => r.total);

    const c1 = new Chart(pie.getContext("2d"), {
      type: "pie",
      data: { labels, datasets: [{ data: catTotals }] },
      options: {
        plugins: {
          legend: { position: "right" },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${fmtMoney(ctx.parsed)}`,
            },
          },
        },
      },
    });

    const c2 = new Chart(donut.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: ["Fixas", "Variáveis"],
        datasets: [{ data: [data.fixed, data.variable] }],
      },
      options: { plugins: { legend: { position: "bottom" } } },
    });

    const mLabels = data.monthly.map(
      (m) => m.month.slice(5, 7) + "/" + m.month.slice(2, 4)
    );
    const c3 = new Chart(bars.getContext("2d"), {
      type: "bar",
      data: {
        labels: mLabels,
        datasets: [
          { label: "Receitas", data: data.monthly.map((m) => m.income) },
          { label: "Despesas", data: data.monthly.map((m) => m.expense) },
          { label: "Poupanças", data: data.monthly.map((m) => m.savings) },
          {
            type: "line",
            label: "Saldo",
            data: data.monthly.map((m) => m.net),
            borderWidth: 2,
            tension: 0.25,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: { y: { beginAtZero: true } },
      },
    });

    // devolve função para exportar imagens
    return {
      toImages: async () => {
        // garante render antes de exportar
        await Promise.all([c1.update(), c2.update(), c3.update()]);
        return {
          pie: pie.toDataURL("image/png", 1.0),
          donut: donut.toDataURL("image/png", 1.0),
          bars: bars.toDataURL("image/png", 1.0),
        };
      },
      destroy: () => {
        try {
          c1.destroy();
          c2.destroy();
          c3.destroy();
        } catch {}
      },
    };
  }

  // pré-visualização
  let lastPreview = null; // { toImages, destroy, meta }
  btPrev?.addEventListener("click", async () => {
    try {
      if (lastPreview?.destroy) lastPreview.destroy();

      const scope =
        md.querySelector('input[name="rep-scope"]:checked')?.value || "monthly";
      const year = Number(selYear.value);
      const month0 =
        scope === "monthly" ? Number(inpMonth.value.split("-")[1]) - 1 : 0;

      const data = await buildDataset(scope, year, month0);
      lastPreview = await renderPreviewHTML(scope, year, month0, data);
      lastPreview.meta = { scope, year, month0, data };
    } catch (e) {
      console.error(e);
      previewBox.innerHTML = `<div class="r-card"><div class="muted">Não foi possível gerar a pré-visualização. ${String(
        e?.message || e
      )}</div></div>`;
    }
  });

  // alterna month control
  md?.querySelectorAll('input[name="rep-scope"]').forEach((r) => {
    r.addEventListener("change", () => {
      const scope = md.querySelector('input[name="rep-scope"]:checked')?.value;
      $("#ctl-month").style.display = scope === "monthly" ? "" : "none";
    });
  });
  $("#ctl-month").style.display = ""; // mensal por defeito

  // PDF
  btPdf?.addEventListener("click", async () => {
    try {
      await ensureJsPdf();
      if (!lastPreview?.meta) {
        // se não houver preview, cria uma com os valores atuais
        await btPrev.click();
        if (!lastPreview?.meta) throw new Error("Sem dados para gerar PDF.");
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4" }); // 595 x 842 pt approx.
      const margin = { t: 64, r: 40, b: 54, l: 40 };
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      const { scope, year, month0, data } = lastPreview.meta;
      const monthNamesPT = [
        "janeiro",
        "fevereiro",
        "março",
        "abril",
        "maio",
        "junho",
        "julho",
        "agosto",
        "setembro",
        "outubro",
        "novembro",
        "dezembro",
      ];
      const scopeLabel =
        scope === "annual"
          ? `Anual ${year}`
          : `${monthNamesPT[month0]} de ${year}`;

      // header/footer template
      function headerFooter(page, pages) {
        // header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(REPORT_META.headerLeft, margin.l, 30);
        doc.setFont("helvetica", "normal");
        doc.text(
          REPORT_META.headerRight.replace("{SCOPE_LABEL}", scopeLabel),
          pageW - margin.r,
          30,
          { align: "right" }
        );

        // footer
        const nowStr = new Date().toLocaleString("pt-PT");
        const left = REPORT_META.footerLeft;
        const right = REPORT_META.footerRight
          .replace("{DATE}", nowStr)
          .replace("{PAGE}", String(page))
          .replace("{PAGES}", String(pages));
        doc.setFontSize(9);
        doc.setTextColor(90);
        doc.text(left, margin.l, pageH - 24);
        doc.text(right, pageW - margin.r, pageH - 24, { align: "right" });
        doc.setTextColor(0);
      }

      // título
      const title =
        scope === "annual"
          ? REPORT_META.titles.annual.replace("{YYYY}", year)
          : REPORT_META.titles.monthly
              .replace("{YYYY}", year)
              .replace("{MMMM}", monthNamesPT[month0]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(title, margin.l, margin.t);

      // KPIs
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      const kpiY0 = margin.t + 20;
      const boxW = (pageW - margin.l - margin.r - 30) / 2;
      const lineH = 16;

      const KPIs = [
        ["Receitas", fmtMoney(data.income)],
        ["Despesas", "-" + fmtMoney(data.expense).replace("€ ", "")],
        ["Poupanças", "-" + fmtMoney(data.savings).replace("€ ", "")],
        ["Saldo líquido", fmtMoney(data.net)],
      ];
      // bloco esquerdo
      doc.setFont("helvetica", "bold");
      doc.text("KPIs do período", margin.l, kpiY0);
      doc.setFont("helvetica", "normal");
      KPIs.forEach((row, i) => {
        doc.text(row[0], margin.l, kpiY0 + 20 + i * lineH);
        doc.text(row[1], margin.l + 180, kpiY0 + 20 + i * lineH);
      });

      // gráficos → imagens a partir do preview (não é screenshot do ecrã, é o próprio canvas)
      const imgs = await lastPreview.toImages();

      // pizza categorias (direita)
      const pieW = 220,
        pieH = 220;
      doc.addImage(
        imgs.pie,
        "PNG",
        margin.l + boxW + 30,
        kpiY0 - 10,
        pieW,
        pieH,
        undefined,
        "FAST"
      );

      // página 1: donut + barras + tabela top categorias (se couber)
      let cursorY = kpiY0 + pieH + 30;

      // donut
      doc.setFont("helvetica", "bold");
      doc.text("Fixas vs Variáveis", margin.l, cursorY);
      doc.addImage(
        imgs.donut,
        "PNG",
        margin.l,
        cursorY + 10,
        220,
        220,
        undefined,
        "FAST"
      );

      // barras
      doc.setFont("helvetica", "bold");
      doc.text("Séries mensais", margin.l + 260, cursorY);
      doc.addImage(
        imgs.bars,
        "PNG",
        margin.l + 260,
        cursorY + 10,
        pageW - margin.l - margin.r - 260,
        220,
        undefined,
        "FAST"
      );

      // categorias (tabela)
      const tableY = cursorY + 240 + 20;
      const catRows = data.catRows.map((r) => [r.name, fmtMoney(r.total)]);
      if (window.jspdf?.autoTable && catRows.length) {
        doc.setFont("helvetica", "bold");
        doc.text("Top categorias (despesas)", margin.l, tableY);
        doc.autoTable({
          startY: tableY + 8,
          styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
          head: [["Categoria", "Total"]],
          body: catRows,
          margin: { left: margin.l, right: margin.r },
          theme: "grid",
        });
      }

      // taxas de esforço (nova página se necessário)
      let pages = doc.getNumberOfPages();
      let finalY = doc.lastAutoTable?.finalY || tableY + 20;
      if (finalY > pageH - margin.b - 140) {
        doc.addPage();
        pages = doc.getNumberOfPages();
        finalY = margin.t;
      }

      const taxTitleY = finalY + 24;
      doc.setFont("helvetica", "bold");
      doc.text("Taxas de esforço", margin.l, taxTitleY);
      const tEff = [
        [
          "Fixas / Receita",
          `${(data.income ? (data.fixed / data.income) * 100 : 0).toFixed(1)}%`,
        ],
        [
          "Variáveis / Receita",
          `${(data.income ? (data.variable / data.income) * 100 : 0).toFixed(
            1
          )}%`,
        ],
        [
          "Poupança / Receita",
          `${(data.income ? (data.savings / data.income) * 100 : 0).toFixed(
            1
          )}%`,
        ],
      ];
      if (window.jspdf?.autoTable) {
        doc.autoTable({
          startY: taxTitleY + 8,
          head: [["Indicador", "Valor"]],
          body: tEff,
          styles: { font: "helvetica", fontSize: 10, cellPadding: 4 },
          margin: { left: margin.l, right: margin.r },
          theme: "grid",
        });
      } else {
        doc.setFont("helvetica", "normal");
        tEff.forEach((r, i) => {
          doc.text(r[0], margin.l, taxTitleY + 24 + i * 16);
          doc.text(r[1], margin.l + 220, taxTitleY + 24 + i * 16);
        });
      }

      // paginar com header/footer
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        headerFooter(i, totalPages);
      }

      doc.setProperties({ title: title, author: REPORT_META.pdfAuthor });
      const fileName =
        scope === "annual"
          ? `Relatorio_${year}.pdf`
          : `Relatorio_${pad2(month0 + 1)}_${year}.pdf`;
      doc.save(fileName);
    } catch (e) {
      console.error(e);
      alert("Não foi possível gerar o PDF: " + (e?.message || e));
    }
  });

  // cria preview automaticamente ao abrir modal
  btOpen?.addEventListener("click", () =>
    setTimeout(() => btPrev?.click(), 50)
  );
}
