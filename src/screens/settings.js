// src/screens/settings.js
export async function init({ sb, outlet } = {}) {
  sb ||= window.sb;
  outlet ||= document.getElementById("outlet");

  // =============== Ligação / sessão =====================
  async function preflight() {
    if (!navigator.onLine) throw new Error("Sem ligação à internet.");
    const {
      data: { session },
      error,
    } = await sb.auth.getSession();
    if (error) throw error;
    if (!session) throw new Error("Sessão expirada — faça login.");

    // ping rápido ao PostgREST
    const { error: pingErr } = await sb
      .from("transaction_types")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (pingErr) throw new Error("Falha de ligação ao Supabase.");
  }
  const getUserId = async () => (await sb.auth.getUser()).data?.user?.id;

  // ================= Helpers base =======================
  const normalizeKey = (s) =>
    (s || "")
      .toLocaleLowerCase("pt-PT")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const $ = (sel) =>
    (outlet && outlet.querySelector(sel)) || document.querySelector(sel);

  const $$ = (sel) => {
    const inOutlet = outlet ? outlet.querySelectorAll(sel) : null;
    return Array.from(
      inOutlet && inOutlet.length ? inOutlet : document.querySelectorAll(sel)
    );
  };

  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const money = (n) =>
    "€ " +
    Number(n || 0).toLocaleString("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

  const currentMonthStartISO = () => {
    const n = new Date();
    return ymd(new Date(n.getFullYear(), n.getMonth(), 1));
  };
  const nextMonthStartISO = () => {
    const n = new Date();
    return ymd(new Date(n.getFullYear(), n.getMonth() + 1, 1));
  };

  // carrega scripts externos 1x
  async function loadScript(src) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  async function ensureChartStack() {
    if (!window.Chart) {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
      );
    }
    if (!window.ChartDataLabels && !window.__loadingCDL__) {
      window.__loadingCDL__ = true;
      try {
        await loadScript(
          "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js"
        );
      } catch (e) {
        console.warn(
          "Falhou a carregar chartjs-plugin-datalabels — sigo sem rótulos.",
          e
        );
      } finally {
        window.__loadingCDL__ = false;
      }
    }
  }
  async function getJsPDF() {
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    try {
      const mod = await import(
        "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.es.min.js"
      );
      return mod.jsPDF || window.jspdf?.jsPDF;
    } catch {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
      );
      return window.jspdf?.jsPDF;
    }
  }

  // ================= Regularidades ======================
  const { data: regs } = await sb
    .from("regularities")
    .select("id,code,name_pt");
  const REG_BY_LABEL = new Map();
  (regs || []).forEach((r) => {
    REG_BY_LABEL.set((r.code || "").toLowerCase(), r.id);
    REG_BY_LABEL.set((r.name_pt || "").toLowerCase(), r.id);
  });
  function regularityFromLabel(label) {
    const t = (label || "").toString().trim().toLowerCase();
    if (!t) return null;
    const alias = {
      diaria: "DAILY",
      diária: "DAILY",
      semanal: "WEEKLY",
      quinzenal: "BIWEEKLY",
      mensal: "MONTHLY",
      "2 em 2 meses": "BIMONTHLY",
      bimensal: "BIMONTHLY",
      trimestral: "QUARTERLY",
      anual: "YEARLY",
      unica: "ONCE",
      única: "ONCE",
    };
    const code = (alias[t] || t || "").toLowerCase();
    return REG_BY_LABEL.get(code) || REG_BY_LABEL.get(t) || null;
  }
  function inferRegularity(area, cat) {
    const s = `${area || ""} > ${cat || ""}`.toLowerCase();
    if (
      /(renda|mensalidad|seguro|tv|internet|nos|telem[óo]vel|empregada|pilates|gin[aá]sio)/.test(
        s
      )
    )
      return REG_BY_LABEL.get("monthly");
    if (/(iuc|inspe[cç][aã]o|im[ií]vel|seguro.*sa[úu]de|f[eé]rias)/.test(s))
      return REG_BY_LABEL.get("yearly");
    return null;
  }

  // =============== IMPORTAÇÃO CSV =======================
  const log = (m) => {
    const el = $("#imp-log");
    if (el) el.textContent += (el.textContent ? "\n" : "") + m;
  };
  const info = (m, ok = false) => {
    const el = $("#imp-info");
    if (el) {
      el.textContent = m || "";
      el.style.color = ok ? "#16a34a" : "";
    }
  };
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
  const splitCSVLine = (line, d) =>
    line
      .split(new RegExp(`${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`))
      .map((s) => s.replace(/^"(.*)"$/, "$1").replace(/""/g, '"'));
  const detectDelimiter = (text) => {
    const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
    const cand = [",", ";", "\t", "|"];
    const scores = cand.map(
      (d) =>
        (
          sample.match(new RegExp(`\\${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`, "g")) ||
          []
        ).length
    );
    return cand[scores.indexOf(Math.max(...scores))] || ",";
  };
  const normalizeMoney = (s) => {
    if (typeof s === "number") return +s.toFixed(2);
    if (!s) return 0;
    const n = String(s)
      .replace(/[€\s]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const v = parseFloat(n);
    return isNaN(v) ? 0 : +v.toFixed(2);
  };
  const mapKind = (tipo) => {
    const t = String(tipo || "").toLowerCase();
    if (t.includes("receit")) return "income";
    if (t.includes("poup")) return "savings";
    return "expense";
  };
  const mapNature = (tipo) =>
    String(tipo || "")
      .toLowerCase()
      .startsWith("fix")
      ? "fixed"
      : "variable";

  // parentName(area), childName(categoria). Cria versões do utilizador se necessário.
  async function ensureCategoryPath(parentName, childName, tipo) {
    const uid = await getUserId();
    if (!uid) throw new Error("Sessão expirada.");
    const kind = mapKind(tipo);
    const nature = kind === "expense" ? mapNature(tipo) : null;

    let parentGlobal = null,
      parentId = null;

    if (parentName) {
      const { data: pGlob } = await sb
        .from("categories")
        .select("id")
        .eq("name", parentName)
        .is("parent_id", null)
        .is("user_id", null)
        .maybeSingle();
      parentGlobal = pGlob?.id || null;

      if (!parentGlobal) {
        const { data: pOwn } = await sb
          .from("categories")
          .select("id")
          .eq("name", parentName)
          .is("parent_id", null)
          .eq("user_id", uid)
          .maybeSingle();
        parentId = pOwn?.id || null;
      } else parentId = parentGlobal;

      if (!parentId) {
        const { data: created, error } = await sb
          .from("categories")
          .insert({
            user_id: uid,
            parent_id: null,
            name: parentName,
            kind,
            nature,
          })
          .select("id")
          .single();
        if (error) throw error;
        parentId = created.id;
      }
    }

    if (!childName) return parentId;

    if (parentGlobal) {
      const { data: cGlob } = await sb
        .from("categories")
        .select("id")
        .eq("name", childName)
        .eq("parent_id", parentGlobal)
        .is("user_id", null)
        .maybeSingle();
      if (cGlob?.id) return cGlob.id;
    }

    const { data: cOwn } = await sb
      .from("categories")
      .select("id")
      .eq("name", childName)
      .eq("parent_id", parentId)
      .eq("user_id", uid)
      .maybeSingle();
    if (cOwn?.id) return cOwn.id;

    const { data: createdChild, error: e4 } = await sb
      .from("categories")
      .insert({
        user_id: uid,
        parent_id: parentId,
        name: childName,
        kind,
        nature,
      })
      .select("id")
      .single();
    if (e4) throw e4;
    return createdChild.id;
  }

  async function getExpenseTypeId() {
    const { data } = await sb
      .from("transaction_types")
      .select("id")
      .eq("code", "EXPENSE")
      .single();
    return data.id;
  }
  async function getDefaultAccountId() {
    const uid = await getUserId();
    let { data: acc } = await sb
      .from("accounts")
      .select("id")
      .eq("name", "Conta Principal")
      .maybeSingle();
    if (!acc) {
      const r = await sb.from("accounts").select("id").limit(1);
      acc = r.data?.[0];
    }
    if (!acc) {
      const { data: created } = await sb
        .from("accounts")
        .insert({
          name: "Conta Principal",
          user_id: uid,
          currency: "EUR",
          type: "bank",
        })
        .select("id")
        .single();
      return created.id;
    }
    return acc.id;
  }

  async function parseCsvFile(file) {
    const text = await file.text();
    const delimiter = detectDelimiter(text);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
    if (lines.length < 2) return [];
    const headers = splitCSVLine(lines[0], delimiter).map(normalizeHeader);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCSVLine(lines[i], delimiter);
      const obj = {};
      headers.forEach((h, idx) => (obj[h] = cols[idx]));
      rows.push(obj);
    }
    return rows;
  }

  function renderPreviewTable(rows) {
    const wrap = $("#imp-table-wrap");
    const thead = $("#imp-table thead");
    const tbody = $("#imp-table tbody");
    if (!wrap || !thead || !tbody) return;
    if (!rows.length) {
      wrap.style.display = "none";
      return;
    }
    const cols = Object.keys(rows[0]);
    thead.innerHTML = `<tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>`;
    tbody.innerHTML = rows
      .slice(0, 200)
      .map(
        (r) => `<tr>${cols.map((c) => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`
      )
      .join("");
    wrap.style.display = "block";
  }

  let previewRows = [];
  $("#imp-clear")?.addEventListener("click", () => {
    previewRows = [];
    $("#imp-table-wrap").style.display = "none";
    $("#imp-log").textContent = "";
    info("");
  });
  $("#imp-preview")?.addEventListener("click", async () => {
    const f = $("#imp-file")?.files?.[0];
    if (!f) return alert("Escolha um ficheiro CSV.");
    $("#imp-log").textContent = "";
    info("A analisar CSV…");
    const rows = await parseCsvFile(f);
    previewRows = rows.map((r) => ({
      Tipo: r["tipo"] ?? r["Tipo"] ?? "",
      area: r["area"] ?? r["Area"] ?? "",
      categoria: r["categoria"] ?? r["Categoria"] ?? "",
      regularidade: r["regularidade"] ?? r["Regularidade"] ?? "",
      montante:
        r["montante"] ?? r["Montante"] ?? r["valor"] ?? r["Valor"] ?? "",
    }));
    renderPreviewTable(previewRows);
    info(`Pré-visualização: ${previewRows.length} linhas.`);
  });
  $("#imp-import")?.addEventListener("click", async () => {
    try {
      await preflight();
    } catch (e) {
      alert(e.message || "Falha de ligação.");
      return;
    }
    if (!previewRows.length) return alert("Faça a pré-visualização primeiro.");
    const m = $("#imp-month")?.value;
    if (!m) return alert("Indique o mês (YYYY-MM).");
    const [y, mo] = m.split("-").map(Number);
    const startISO = ymd(new Date(y, mo - 1, 1));
    const endISO = ymd(new Date(y, mo, 1));

    const expenseTypeId = await getExpenseTypeId();
    const accountId = await getDefaultAccountId();
    const uid = await getUserId();

    if (!confirm(`Substituir dados de ${String(mo).padStart(2, "0")}/${y}?`))
      return;

    await sb
      .from("transactions")
      .delete()
      .gte("date", startISO)
      .lt("date", endISO);

    const txs = [];
    for (const row of previewRows) {
      const tipo = row.Tipo ?? row.tipo;
      const area = row["Área"] ?? row.area;
      const cat = row.Categoria ?? row.categoria;
      const amount = normalizeMoney(
        row.Montante ?? row.montante ?? row.Valor ?? row.valor
      );
      if (!amount) continue;
      let regularity_id = regularityFromLabel(row.regularidade);
      if (!regularity_id) regularity_id = inferRegularity(area, cat);
      const category_id = await ensureCategoryPath(
        area || null,
        cat || area || "Outros",
        tipo
      );
      txs.push({
        user_id: uid,
        type_id: expenseTypeId,
        account_id: accountId,
        category_id,
        date: startISO,
        amount,
        currency: "EUR",
        expense_nature: mapNature(tipo),
        regularity_id,
        description:
          `${area || ""}${area ? " > " : ""}${cat || ""}`.trim() || null,
      });
    }

    const dedupe = new Map();
    for (const t of txs) {
      const key = [
        t.user_id,
        t.date,
        t.amount.toFixed(2),
        t.type_id,
        t.account_id,
        t.category_id || "_",
        t.description || "",
      ].join("|");
      if (!dedupe.has(key)) dedupe.set(key, t);
    }
    const finalTxs = [...dedupe.values()];
    const CHUNK = 200;
    let inserted = 0;
    for (let i = 0; i < finalTxs.length; i += CHUNK) {
      const chunk = finalTxs.slice(i, i + CHUNK);
      const { error } = await sb.from("transactions").insert(chunk);
      if (error) throw error;
      inserted += chunk.length;
    }
    info(`✅ Importação concluída: ${inserted} registos.`, true);
    alert("Importação concluída!");
  });

  // ================== RELATÓRIOS ========================
  const overlay = $("#report-overlay");
  const closeBtn = $("#rpt-close");
  let _lastFocus = null;

  // util: carrega imagem e devolve dataURL (usa assets no mesmo domínio p/ evitar CORS)
  async function toDataURL(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });
  }

  // trava alturas dos canvases para evitar “crescimento infinito”
  function lockCanvas(el, h) {
    if (!el) return;
    const px = String(h) + "px";
    el.setAttribute("height", h);
    el.style.height = px;
    el.style.maxHeight = px;
    el.style.minHeight = px;
    el.style.display = "block";
  }
  function fixCanvasHeights() {
    lockCanvas($("#rpt-cat-pie"), 240);
    lockCanvas($("#rpt-fixed-donut"), 240);
    lockCanvas($("#rpt-series"), 260);
    lockCanvas($("#rpt-top-exp"), 220);
    lockCanvas($("#rpt-effort"), 200);
    lockCanvas($("#rpt-savings-rate"), 200);
  }

  function openReport() {
    if (!overlay) return;
    _lastFocus = document.activeElement;
    overlay.classList.remove("hidden");
    overlay.removeAttribute("aria-hidden");
    document.body.style.overflow = "hidden";
    overlay.focus();

    // sincroniza filtros de fora -> dentro
    const type = $("#rpt-type")?.value || "monthly";
    $("#rpt-type-inside").value = type;
    $("#rpt-month-inside").value = $("#rpt-month")?.value || "";
    $("#rpt-from-inside").value = $("#rpt-from")?.value || "";
    $("#rpt-to-inside").value = $("#rpt-to")?.value || "";
    $("#rpt-year-inside").value = $("#rpt-year")?.value || "";
    toggleReportInputsInside();
  }
  function closeReport() {
    if (!overlay) return;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    destroyCharts();
    if (_lastFocus?.focus) _lastFocus.focus();
  }
  closeBtn?.addEventListener("click", closeReport);
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closeReport();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && !overlay.classList.contains("hidden"))
      closeReport();
  });

  // focus trap dentro do modal (opcional, acessibilidade)
  overlay?.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = overlay.querySelectorAll(
      "button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])"
    );
    if (!f.length) return;
    const first = f[0],
      last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // alterna inputs (fora)
  function toggleReportInputs() {
    const t = $("#rpt-type")?.value || "monthly";
    $("#rpt-month-wrap")?.classList.toggle("hidden", t !== "monthly");
    $("#rpt-range-wrap")?.classList.toggle("hidden", t !== "range");
    $("#rpt-range2-wrap")?.classList.toggle("hidden", t !== "range");
    $("#rpt-year-wrap")?.classList.toggle("hidden", t !== "yearly");
  }
  // alterna inputs (dentro do modal)
  function toggleReportInputsInside() {
    const t = $("#rpt-type-inside")?.value || "monthly";
    $("#rpt-month-inside-wrap")?.classList.toggle("hidden", t !== "monthly");
    $("#rpt-from-inside-wrap")?.classList.toggle("hidden", t !== "range");
    $("#rpt-to-inside-wrap")?.classList.toggle("hidden", t !== "range");
    $("#rpt-year-inside-wrap")?.classList.toggle("hidden", t !== "yearly");
  }
  $("#rpt-type")?.addEventListener("change", toggleReportInputs);
  toggleReportInputs();

  // abrir & construir
  $("#btn-report-open")?.addEventListener("click", async () => {
    try {
      await preflight();
    } catch (e) {
      return alert(e.message || "Sem ligação/sessão.");
    }
    await ensureChartStack();
    openReport();
    await new Promise((r) => requestAnimationFrame(r));
    await buildReport();
  });

  // reatividade: fora
  ["#rpt-month", "#rpt-from", "#rpt-to", "#rpt-year"].forEach((sel) => {
    $(sel)?.addEventListener("change", () => {
      if (!overlay?.classList.contains("hidden"))
        syncInsideFromOutsideAndBuild();
    });
  });
  // reatividade: dentro
  $("#rpt-type-inside")?.addEventListener("change", () => {
    toggleReportInputsInside();
    syncOutsideFromInsideAndBuild();
  });
  [
    "#rpt-month-inside",
    "#rpt-from-inside",
    "#rpt-to-inside",
    "#rpt-year-inside",
  ].forEach((sel) => {
    $(sel)?.addEventListener("change", syncOutsideFromInsideAndBuild);
  });

  function syncInsideFromOutsideAndBuild() {
    $("#rpt-type-inside").value = $("#rpt-type").value;
    $("#rpt-month-inside").value = $("#rpt-month").value;
    $("#rpt-from-inside").value = $("#rpt-from").value;
    $("#rpt-to-inside").value = $("#rpt-to").value;
    $("#rpt-year-inside").value = $("#rpt-year").value;
    toggleReportInputsInside();
    buildReport();
  }
  function syncOutsideFromInsideAndBuild() {
    $("#rpt-type").value = $("#rpt-type-inside").value;
    $("#rpt-month").value = $("#rpt-month-inside").value;
    $("#rpt-from").value = $("#rpt-from-inside").value;
    $("#rpt-to").value = $("#rpt-to-inside").value;
    $("#rpt-year").value = $("#rpt-year-inside").value;
    toggleReportInputs();
    buildReport();
  }

  let _rptCat = null,
    _rptFix = null,
    _rptSeries = null;
  let _rptTopExp = null,
    _rptEffort = null,
    _rptSavings = null;
  let _catLegendPDF = [],
    _fixLegendPDF = [],
    _monthlyPDF = [],
    _incomeCatPDF = [],
    _expenseCatPDF = [],
    _regularityPDF = [];

  function destroyCharts() {
    try {
      _rptCat?.destroy();
    } catch {}
    try {
      _rptFix?.destroy();
    } catch {}
    try {
      _rptSeries?.destroy();
    } catch {}
    try {
      _rptTopExp?.destroy();
    } catch {}
    try {
      _rptEffort?.destroy();
    } catch {}
    try {
      _rptSavings?.destroy();
    } catch {}
    _rptCat =
      _rptFix =
      _rptSeries =
      _rptTopExp =
      _rptEffort =
      _rptSavings =
        null;
    _catLegendPDF = [];
    _fixLegendPDF = [];
    _monthlyPDF = [];
    _incomeCatPDF = [];
    _expenseCatPDF = [];
    _regularityPDF = [];
  }
  function makeChart(canvasEl, config) {
    const el =
      typeof canvasEl === "string"
        ? document.querySelector(canvasEl)
        : canvasEl;
    if (!el) return null;
    const prev = Chart.getChart(el);
    if (prev) prev.destroy();
    return new Chart(el, config);
  }
  function fmtPct(n) {
    return (Number(n || 0) * 100).toFixed(1) + "%";
  }
  function by(arr, keyFn) {
    const m = new Map();
    for (const row of arr) {
      const k = keyFn(row);
      m.set(k, (m.get(k) || []).concat([row]));
    }
    return m;
  }
  function renderTable(el, cols, rows, footer = null) {
    if (!el) return;
    const th = `<thead><tr>${cols
      .map((c) => `<th>${c.header}</th>`)
      .join("")}</tr></thead>`;
    const tb = `<tbody>${rows
      .map(
        (r) => `<tr>${cols.map((c) => `<td>${c.cell(r)}</td>`).join("")}</tr>`
      )
      .join("")}</tbody>`;
    const tf = footer
      ? `<tfoot><tr>${cols
          .map((c, i) => `<td>${footer[i] || ""}</td>`)
          .join("")}</tr></tfoot>`
      : "";
    el.innerHTML = th + tb + tf;
  }

  let _isBuildingReport = false;
  async function buildReport() {
    if (_isBuildingReport) return;
    _isBuildingReport = true;
    try {
      destroyCharts();
      fixCanvasHeights();
      const legendEl = $("#rpt-cat-legend");
      if (legendEl) legendEl.innerHTML = "";
      if ($("#rpt-fv-legend")) $("#rpt-fv-legend").innerHTML = "";

      // período
      const selType = $("#rpt-type")?.value || "monthly";
      let from, to, label;
      if (selType === "monthly") {
        const m =
          $("#rpt-month")?.value || new Date().toISOString().slice(0, 7);
        const [y, mm] = m.split("-").map(Number);
        from = ymd(new Date(y, mm - 1, 1));
        to = ymd(new Date(y, mm, 1));
        label = m;
      } else if (selType === "range") {
        const a = $("#rpt-from")?.value || new Date().toISOString().slice(0, 7);
        const b = $("#rpt-to")?.value || a;
        const [ya, ma] = a.split("-").map(Number);
        const [yb, mb] = b.split("-").map(Number);
        from = ymd(new Date(ya, ma - 1, 1));
        to = ymd(new Date(yb, mb, 1));
        label = `${a} → ${b}`;
      } else {
        const y = Number($("#rpt-year")?.value || new Date().getFullYear());
        from = ymd(new Date(y, 0, 1));
        to = ymd(new Date(y + 1, 0, 1));
        label = String(y);
      }
      const titleEl = $("#rpt-title");
      if (titleEl) titleEl.textContent = `Relatório Financeiro — ${label}`;

      // tipos
      const [{ data: tInc }, { data: tExp }, { data: tSav }] =
        await Promise.all([
          sb
            .from("transaction_types")
            .select("id")
            .eq("code", "INCOME")
            .single(),
          sb
            .from("transaction_types")
            .select("id")
            .eq("code", "EXPENSE")
            .single(),
          sb
            .from("transaction_types")
            .select("id")
            .eq("code", "SAVINGS")
            .single(),
        ]);

      // dados
      let rows = [];
      try {
        const sel =
          "date,amount,signed_amount,type_id,expense_nature,category:categories(name,parent_id,nature)";
        const r = await sb
          .from("transactions")
          .select(sel)
          .gte("date", from)
          .lt("date", to)
          .order("date", { ascending: true });
        if (r.error) throw r.error;
        rows = r.data || [];
      } catch {
        const r2 = await sb
          .from("transactions")
          .select("date,amount,type_id")
          .gte("date", from)
          .lt("date", to)
          .order("date", { ascending: true });
        rows = r2.data || [];
      }

      const incRows = rows.filter((r) => r.type_id === tInc.id);
      const expRows = rows.filter((r) => r.type_id === tExp.id);
      const savRows = rows.filter((r) => r.type_id === tSav.id);

      const income = sum(incRows.map((x) => x.amount));
      const expense = sum(expRows.map((x) => x.amount));
      const savings = sum(savRows.map((x) => x.amount));
      const balance =
        rows.length && "signed_amount" in rows[0]
          ? sum(rows.map((x) => x.signed_amount))
          : income - expense - savings;

      if ($("#rpt-kpi-income"))
        $("#rpt-kpi-income").textContent = money(income);
      if ($("#rpt-kpi-expense"))
        $("#rpt-kpi-expense").textContent = money(expense);
      if ($("#rpt-kpi-savings"))
        $("#rpt-kpi-savings").textContent = money(savings);
      if ($("#rpt-kpi-balance"))
        $("#rpt-kpi-balance").textContent = money(balance);

      // ===== 1) Despesas por categoria (pizza) =====
      await ensureChartStack();
      const byCatExp = new Map();
      expRows.forEach((x) => {
        const name = x.category?.name || "Sem categoria";
        byCatExp.set(name, (byCatExp.get(name) || 0) + Number(x.amount || 0));
      });
      const catEntries = [...byCatExp.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12);
      const catLabels = catEntries.map(([k]) => k);
      const catValues = catEntries.map(([, v]) => v);
      const catTotal = catValues.reduce((a, b) => a + b, 0);

      const showDL = !!window.ChartDataLabels && catTotal > 0;
      _rptCat = makeChart($("#rpt-cat-pie"), {
        type: "pie",
        data: { labels: catLabels, datasets: [{ data: catValues }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            datalabels: showDL
              ? {
                  color: "#0f172a",
                  backgroundColor: "rgba(255,255,255,.85)",
                  borderRadius: 4,
                  padding: 4,
                  formatter: (v) =>
                    `${money(v)} (${((v / catTotal) * 100).toFixed(1)}%)`,
                  display: (ctx) =>
                    (ctx.dataset.data[ctx.dataIndex] || 0) >= catTotal * 0.06,
                }
              : { display: false },
          },
        },
      });
      const catColors = _rptCat?.data?.datasets?.[0]?.backgroundColor || [];
      _catLegendPDF = catLabels.map((lab, i) => ({
        label: lab,
        value: catValues[i],
        pct: catTotal ? catValues[i] / catTotal : 0,
        color: catColors[i] || "#64748b",
      }));
      if ($("#rpt-cat-legend")) {
        $("#rpt-cat-legend").innerHTML = _catLegendPDF
          .map(
            (x) => `
        <div class="rpt-legend__item">
          <span class="rpt-legend__dot" style="background:${x.color}"></span>
          <span style="flex:1">${x.label}</span>
          <strong>${money(x.value)}</strong>
          <span style="color:#64748b">&nbsp;(${(x.pct * 100).toFixed(
            1
          )}%)</span>
        </div>`
          )
          .join("");
      }

      // ===== 2) Fixas vs Variáveis (donut) =====
      const isFixed = (x) =>
        x.expense_nature === "fixed" ||
        (!x.expense_nature && x.category?.nature === "fixed");
      const fixedAmt = sum(expRows.filter(isFixed).map((x) => x.amount));
      const variableAmt = sum(
        expRows.filter((x) => !isFixed(x)).map((x) => x.amount)
      );
      const totFV = fixedAmt + variableAmt;

      _rptFix = makeChart($("#rpt-fixed-donut"), {
        type: "doughnut",
        data: {
          labels: ["Fixas", "Variáveis"],
          datasets: [{ data: [fixedAmt, variableAmt] }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { position: "bottom" },
            datalabels:
              totFV > 0 ? { formatter: (v) => money(v) } : { display: false },
          },
        },
      });
      _fixLegendPDF = [
        {
          label: "Fixas",
          value: fixedAmt,
          pct: totFV ? fixedAmt / totFV : 0,
          color: "#36a2eb",
        },
        {
          label: "Variáveis",
          value: variableAmt,
          pct: totFV ? variableAmt / totFV : 0,
          color: "#ff6384",
        },
      ];
      if ($("#rpt-fv-legend")) {
        $("#rpt-fv-legend").innerHTML = _fixLegendPDF
          .map(
            (x) => `
        <div class="rpt-legend__item"><span class="rpt-legend__dot" style="background:${
          x.color
        }"></span>
        <span style="flex:1">${x.label}</span>
        <strong>${money(x.value)}</strong>
        <span style="color:#64748b">&nbsp;(${(x.pct * 100).toFixed(
          1
        )}%)</span></div>`
          )
          .join("");
      }

      // ===== 3) Séries mensais + liquidez =====
      const months = {};
      (rows || []).forEach((r) => {
        const m = String(r.date).slice(0, 7);
        months[m] ||= { inc: 0, exp: 0, sav: 0, net: 0 };
        if (r.type_id === tInc.id) {
          months[m].inc += +r.amount;
          months[m].net += +r.amount;
        }
        if (r.type_id === tExp.id) {
          months[m].exp += +r.amount;
          months[m].net -= +r.amount;
        }
        if (r.type_id === tSav.id) {
          months[m].sav += +r.amount;
          months[m].net -= +r.amount;
        }
      });
      const mlabels = Object.keys(months).sort();
      let running = 0;
      const liquidity = mlabels.map((k) => (running += months[k].net));

      _rptSeries = makeChart($("#rpt-series"), {
        type: "bar",
        data: {
          labels: mlabels,
          datasets: [
            { label: "Receitas", data: mlabels.map((k) => months[k].inc) },
            { label: "Despesas", data: mlabels.map((k) => months[k].exp) },
            { label: "Poupanças", data: mlabels.map((k) => months[k].sav) },
            {
              label: "Liquidez (acum.)",
              type: "line",
              data: liquidity,
              tension: 0.25,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { position: "top" },
            datalabels: { display: false },
          },
          scales: { y: { beginAtZero: true } },
        },
      });

      // ===== 3A) NOVO: Top 6 despesas (barras horizontais) =====
      const topExp = [...byCatExp.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
      const topLabels = topExp.map(([k]) => k).reverse();
      const topVals = topExp.map(([, v]) => v).reverse();
      _rptTopExp = makeChart($("#rpt-top-exp"), {
        type: "bar",
        data: {
          labels: topLabels,
          datasets: [{ label: "Despesas", data: topVals }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            datalabels: { display: false },
          },
          scales: { x: { beginAtZero: true } },
        },
      });

      // ===== 3B) NOVO: Linha da taxa de esforço mensal =====
      const effortSeries = mlabels.map((m) => {
        const inc = months[m].inc || 0;
        const exp = months[m].exp || 0;
        return inc ? +((exp / inc) * 100).toFixed(1) : 0;
      });
      _rptEffort = makeChart($("#rpt-effort"), {
        type: "line",
        data: {
          labels: mlabels,
          datasets: [
            {
              label: "Taxa de esforço (%)",
              data: effortSeries,
              borderWidth: 2,
              tension: 0.25,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            datalabels: { display: false },
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: (v) => v + "%" } },
          },
        },
      });

      // ===== 3C) NOVO: Linha da taxa de poupança mensal =====
      const savingsSeries = mlabels.map((m) => {
        const inc = months[m].inc || 0;
        const sav = months[m].sav || 0;
        return inc ? +((sav / inc) * 100).toFixed(1) : 0;
      });
      _rptSavings = makeChart($("#rpt-savings-rate"), {
        type: "line",
        data: {
          labels: mlabels,
          datasets: [
            {
              label: "Taxa de poupança (%)",
              data: savingsSeries,
              borderWidth: 2,
              tension: 0.25,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            datalabels: { display: false },
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: (v) => v + "%" } },
          },
        },
      });

      // ===== 4) Tabelas: por categoria & resumo mensal =====
      const sumMap = (rowsArr, nameFn) => {
        const map = new Map();
        for (const r of rowsArr) {
          const name = nameFn(r) || "Sem categoria";
          map.set(name, (map.get(name) || 0) + Number(r.amount || 0));
        }
        return [...map.entries()].sort((a, b) => b[1] - a[1]);
      };
      const incCat = sumMap(incRows, (r) => r.category?.name);
      const expCat = sumMap(expRows, (r) => r.category?.name);
      const incTot = incCat.reduce((a, [, v]) => a + v, 0);
      const expTot = expCat.reduce((a, [, v]) => a + v, 0);

      _incomeCatPDF = incCat.map(([label, value]) => ({ label, value }));
      _expenseCatPDF = expCat.map(([label, value]) => ({ label, value }));

      renderTable(
        $("#tbl-income-cat"),
        [
          { header: "Categoria", cell: (r) => r[0] },
          { header: "Total", cell: (r) => money(r[1]) },
          { header: "%", cell: (r) => fmtPct(r[1] / (incTot || 1)) },
        ],
        incCat,
        ["Total", money(incTot), "100%"]
      );
      renderTable(
        $("#tbl-expense-cat"),
        [
          { header: "Categoria", cell: (r) => r[0] },
          { header: "Total", cell: (r) => money(r[1]) },
          { header: "%", cell: (r) => fmtPct(r[1] / (expTot || 1)) },
        ],
        expCat,
        ["Total", money(expTot), "100%"]
      );

      // resumo mensal
      running = 0;
      const monthlyRows = mlabels.map((m) => {
        const inc = months[m].inc,
          exp = months[m].exp,
          sav = months[m].sav;
        const net = months[m].net;
        running += net;
        return { m, inc, exp, sav, net, liq: running };
      });
      _monthlyPDF = monthlyRows;
      renderTable(
        $("#tbl-monthly"),
        [
          { header: "Mês", cell: (r) => r.m },
          { header: "Receitas", cell: (r) => money(r.inc) },
          { header: "Despesas", cell: (r) => money(r.exp) },
          { header: "Poupanças", cell: (r) => money(r.sav) },
          { header: "Saldo", cell: (r) => money(r.net) },
          { header: "Liquidez", cell: (r) => money(r.liq) },
        ],
        monthlyRows
      );

      // ===== 5) Regularidade: despesas recorrentes =====
      function regularityDetect(rowsArr) {
        const byCat2 = by(rowsArr, (r) => r.category?.name || "Sem categoria");
        const out = [];
        for (const [cat, list] of byCat2.entries()) {
          const byMonth2 = by(list, (r) => String(r.date).slice(0, 7));
          const monthsCount = byMonth2.size;
          if (monthsCount < 3) continue;
          const vals = [...byMonth2.values()].map((v) =>
            sum(v.map((x) => x.amount))
          );
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          const variance =
            vals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) /
            (vals.length || 1);
          const sd = Math.sqrt(variance);
          const cv = avg ? sd / avg : 1;
          // menos agressivo: marca como “Possível padrão” até 25%
          if (cv <= 0.25) out.push({ cat, meses: monthsCount, media: avg, cv });
        }
        return out.sort((a, b) => b.media - a.media);
      }
      const recurring = regularityDetect(expRows);
      _regularityPDF = recurring;

      if (recurring.length) {
        renderTable(
          $("#tbl-regularity"),
          [
            { header: "Categoria", cell: (r) => r.cat },
            { header: "Meses", cell: (r) => r.meses },
            { header: "Média/mês", cell: (r) => money(r.media) },
            {
              header: "Estabilidade",
              cell: (r) =>
                r.cv <= 0.1
                  ? "Muito estável"
                  : r.cv <= 0.25
                  ? "Possível padrão"
                  : "—",
            },
          ],
          recurring
        );
        $("#tbl-regularity")?.classList.remove("is-empty");
      } else {
        const el = $("#tbl-regularity");
        if (el) {
          el.innerHTML = `<tbody><tr><td style="padding:10px;color:#64748b" colspan="4">Sem padrões suficientes de recorrência neste período.</td></tr></tbody>`;
          el.classList.add("is-empty");
        }
      }

      // ===== 6) Insights / Alertas =====
      const effort = income ? (expense / income) * 100 : 0;
      const savRate = income ? (savings / income) * 100 : 0;
      const negMonths = monthlyRows.filter((r) => r.net < 0).length;
      const lastLiq = monthlyRows.at(-1)?.liq || 0;

      const insights = [];
      insights.push(
        `Taxa de esforço: <strong>${effort.toFixed(1)}%</strong>` +
          (effort > 50
            ? " <span style='color:#b91c1c'>(elevada)</span>"
            : effort > 35
            ? " <span style='color:#f59e0b'>(moderada)</span>"
            : " <span style='color:#15803d'>(saudável)</span>")
      );
      insights.push(
        `Taxa de poupança: <strong>${savRate.toFixed(
          1
        )}%</strong> das receitas.`
      );
      if (negMonths > 0)
        insights.push(
          `Alerta: <strong>${negMonths}</strong> mes(es) com saldo mensal negativo.`
        );
      insights.push(
        `Liquidez no fim do período: <strong>${money(lastLiq)}</strong>.`
      );
      if (recurring.length)
        insights.push(
          `Identificadas <strong>${recurring.length}</strong> categorias de despesa recorrente.`
        );

      if ($("#rpt-insights"))
        $("#rpt-insights").innerHTML = insights
          .map((x) => `<li>${x}</li>`)
          .join("");
    } finally {
      _isBuildingReport = false;
    }

    // resize final
    setTimeout(() => {
      try {
        _rptCat?.resize();
        _rptFix?.resize();
        _rptSeries?.resize();
        _rptTopExp?.resize();
        _rptEffort?.resize();
        _rptSavings?.resize();
      } catch {}
    }, 0);
  }

  // Exportação PDF (inclui novos canvases)
  $("#rpt-export")?.addEventListener("click", async () => {
    try {
      if (typeof _isBuildingReport !== "undefined" && !_isBuildingReport)
        await buildReport();
    } catch {}
    const jsPDF = await getJsPDF();
    if (!jsPDF) return alert("Falhou a carregar o gerador de PDF.");

    const REPORT_CFG = {
      title: ($("#rpt-title")?.textContent || "Relatório Financeiro").trim(),
      author: "António R. Appleton",
      subject: "antonioappleton@gmail.com",
      creator: "WiseBudget®",
      filename: "wisebudget-relatorio.pdf",
      signature: {
        enabled: true,
        name: "Finance Dept.",
        textFallback: "________________________",
        imageUrl: null,
        width: 140,
        height: 60,
      },
    };

    const doc = new (await getJsPDF())({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 40;
    let y = M;

    doc.setProperties({
      title: REPORT_CFG.title,
      subject: REPORT_CFG.subject,
      author: REPORT_CFG.author,
      creator: REPORT_CFG.creator,
      keywords: "finance, report, wisebudget",
    });

    const line = (x1, y1, x2, y2) => {
      doc.setDrawColor(230);
      doc.line(x1, y1, x2, y2);
    };
    const header = (title, subtitle = null) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(title, M, y);
      if (subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(subtitle, W - M, y, { align: "right" });
      }
      y += 18;
      line(M, y, W - M, y);
      y += 12;
    };
    const footer = () => {
      const txt = "antonioappleton@gmail.com | WiseBudget®";
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(txt, M, H - M + 12);
      doc.setTextColor(0);
    };
    const ensureSpace = (need) => {
      if (y + need <= H - M) return;
      footer();
      doc.addPage();
      y = M;
      header(REPORT_CFG.title, new Date().toLocaleString("pt-PT"));
    };
    header(REPORT_CFG.title, new Date().toLocaleString("pt-PT"));

    // KPIs
    const k = [
      ["Receitas", $("#rpt-kpi-income")?.textContent || "—"],
      ["Despesas", $("#rpt-kpi-expense")?.textContent || "—"],
      ["Poupanças", $("#rpt-kpi-savings")?.textContent || "—"],
      ["Saldo", $("#rpt-kpi-balance")?.textContent || "—"],
    ];
    const cellW = (W - 2 * M) / 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    k.forEach((kv, i) => {
      const x = M + i * cellW;
      doc.text(kv[0], x, y);
      doc.setFont("helvetica", "bold");
      doc.text(String(kv[1]), x, y + 14);
      doc.setFont("helvetica", "normal");
    });
    y += 34;

    // helpers
    const canvasToPage = (sel, x, y2, w, h) => {
      const c = document.querySelector(sel);
      if (!c) return y2;
      const img = c.toDataURL("image/png", 1.0);
      doc.addImage(img, "PNG", x, y2, w, h, undefined, "FAST");
      return y2 + h;
    };
    const drawLegend = (items, x, y2, maxW) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lh = 14;
      for (const it of items || []) {
        const color = it?.color || "#888",
          pct = ((it?.pct || 0) * 100).toFixed(1),
          label = it?.label || "—",
          val = it?.value ?? 0;
        doc.setFillColor(color);
        doc.circle(x + 5, y2 + 5, 3, "F");
        doc.text(
          `${label} — € ${Number(val || 0).toLocaleString("pt-PT", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} (${pct}%)`,
          x + 14,
          y2 + 9,
          { maxWidth: maxW - 14 }
        );
        y2 += lh;
      }
      return y2;
    };

    // Distribuição + Fixas/Variáveis
    ensureSpace(260 + 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Distribuição por categorias", M, y);
    doc.text("Fixas vs Variáveis", W / 2 + 8, y);
    y += 10;
    const colW = (W - 2 * M - 16) / 2,
      pieH = 220;
    const y1 = canvasToPage("#rpt-cat-pie", M, y, colW, pieH);
    const y2 = canvasToPage("#rpt-fixed-donut", M + colW + 16, y, colW, pieH);
    y = Math.max(y1, y2) + 8;
    const yLegL = drawLegend(_catLegendPDF, M, y, colW);
    const yLegR = drawLegend(_fixLegendPDF, M + colW + 16, y, colW);
    y = Math.max(yLegL, yLegR) + 16;

    // Série + top despesas
    ensureSpace(260 + 240 + 24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Evolução mensal", M, y);
    y += 10;
    y = canvasToPage("#rpt-series", M, y, W - 2 * M, 240) + 12;

    doc.text("Top 6 categorias de despesa", M, y);
    y += 10;
    y = canvasToPage("#rpt-top-exp", M, y, W - 2 * M, 200) + 16;

    // Esforço & poupança (%)
    ensureSpace(220 + 220 + 18);
    doc.text("Taxa de esforço mensal", M, y);
    y += 10;
    y = canvasToPage("#rpt-effort", M, y, W - 2 * M, 200) + 8;

    doc.text("Taxa de poupança mensal", M, y);
    y += 10;
    y = canvasToPage("#rpt-savings-rate", M, y, W - 2 * M, 200) + 12;

    // Página 2: Tabelas
    footer();
    doc.addPage();
    y = M;
    header(
      "Detalhe — Mensal & Categorias",
      new Date().toLocaleDateString("pt-PT")
    );

    function tablePDF(title, cols, rows, widths) {
      ensureSpace(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, M, y);
      y += 6;
      line(M, y, W - M, y);
      y += 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      let x = M;
      cols.forEach((h, i) => {
        doc.text(h, x, y);
        x += widths[i];
      });
      y += 6;
      line(M, y, W - M, y);
      y += 10;
      doc.setFont("helvetica", "normal");
      rows.forEach((r) => {
        ensureSpace(14);
        let x = M;
        r.forEach((cell, i) => {
          const align = i === 0 ? "left" : "right";
          doc.text(
            String(cell),
            x + (align === "right" ? widths[i] - 2 : 0),
            y,
            { align }
          );
          x += widths[i];
        });
        y += 12;
      });
      y += 4;
    }

    tablePDF(
      "Receitas por categoria",
      ["Categoria", "Total", "%"],
      (_incomeCatPDF || []).map((r) => [
        r.label,
        money(r.value),
        fmtPct(
          r.value /
            ((_incomeCatPDF || []).reduce((a, x) => a + x.value, 0) || 1)
        ),
      ]),
      [W * 0.45, W * 0.25, W * 0.15].map((w) => w * (1 - (2 * M) / W))
    );

    tablePDF(
      "Despesas por categoria",
      ["Categoria", "Total", "%"],
      (_expenseCatPDF || []).map((r) => [
        r.label,
        money(r.value),
        fmtPct(
          r.value /
            ((_expenseCatPDF || []).reduce((a, x) => a + x.value, 0) || 1)
        ),
      ]),
      [W * 0.45, W * 0.25, W * 0.15].map((w) => w * (1 - (2 * M) / W))
    );

    tablePDF(
      "Resumo mensal & liquidez",
      ["Mês", "Receitas", "Despesas", "Poupanças", "Saldo", "Liquidez"],
      (_monthlyPDF || []).map((r) => [
        r.m,
        money(r.inc),
        money(r.exp),
        money(r.sav),
        money(r.net),
        money(r.liq),
      ]),
      [80, 80, 80, 80, 80, 90]
    );

    // Regularidade
    tablePDF(
      "Despesas recorrentes (regularidade)",
      ["Categoria", "Meses", "Média/mês", "Estabilidade"],
      (_regularityPDF || []).map((r) => [
        r.cat,
        r.meses,
        money(r.media),
        r.cv <= 0.1 ? "Muito estável" : r.cv <= 0.25 ? "Possível padrão" : "—",
      ]),
      [200, 60, 90, 100]
    );

    // Assinatura
    if (REPORT_CFG.signature?.enabled) {
      const sig = REPORT_CFG.signature;
      ensureSpace((sig.height || 60) + 70);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("Assinatura", M, y);
      y += 6;
      line(M, y, M + 200, y);
      y += 8;
      if (sig.imageUrl) {
        try {
          const dataUrl = await toDataURL(sig.imageUrl);
          doc.addImage(
            dataUrl,
            "PNG",
            M,
            y,
            sig.width || 140,
            sig.height || 60
          );
        } catch {
          doc.setFont("helvetica", "italic");
          doc.text(sig.textFallback || "__________________", M, y + 28);
        }
      } else {
        doc.setFont("helvetica", "italic");
        doc.text(sig.textFallback || "__________________", M, y + 28);
      }
      y += (sig.height || 60) + 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(sig.name || "", M, y);
    }

    // numeração & rodapé
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Página ${i} de ${pageCount}`, W - M, H - M + 12, {
        align: "right",
      });
      doc.text("antonioappleton@gmail.com | WiseBudget®", M, H - M + 12);
      doc.setTextColor(0);
    }
    doc.save(REPORT_CFG.filename);
  });
  // ================== /RELATÓRIOS ========================

  // =================== SESSÃO / PASSWORD =================
  // Mostrar email da sessão
  try {
    const { data } = await sb.auth.getUser();
    const email = data?.user?.email || "—";
    $("#sess-user-email") && ($("#sess-user-email").textContent = email);
  } catch {
    /* ignore */
  }

  // Terminar sessão
  $("#btn-logout")?.addEventListener("click", async () => {
    try {
      await sb.auth.signOut();
      location.reload(); // limpa estado e abre modal de login
    } catch (e) {
      alert(e?.message || "Não foi possível terminar a sessão.");
    }
  });

  // Alterar palavra-passe (re-autentica opcionalmente com a atual)
  $("#btn-change-pw")?.addEventListener("click", async () => {
    const curr = $("#pw-current")?.value || "";
    const next = $("#pw-new")?.value || "";
    const conf = $("#pw-confirm")?.value || "";

    if (!next || next.length < 8)
      return alert("A nova palavra-passe deve ter pelo menos 8 caracteres.");
    if (next !== conf) return alert("As novas palavras-passe não coincidem.");

    try {
      const { data } = await sb.auth.getUser();
      const email = data?.user?.email;
      if (!email) throw new Error("Sessão inválida.");

      if (curr) {
        const { error: reErr } = await sb.auth.signInWithPassword({
          email,
          password: curr,
        });
        if (reErr) throw new Error("Palavra-passe atual incorreta.");
      }

      const { error } = await sb.auth.updateUser({ password: next });
      if (error) throw error;

      $("#pw-current") && ($("#pw-current").value = "");
      $("#pw-new") && ($("#pw-new").value = "");
      $("#pw-confirm") && ($("#pw-confirm").value = "");
      alert("✅ Palavra-passe atualizada com sucesso.");
    } catch (e) {
      alert(e?.message || "Não foi possível alterar a palavra-passe.");
    }
  });
}