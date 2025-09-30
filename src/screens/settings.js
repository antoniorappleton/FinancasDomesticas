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

  // carrega Chart.js + plugin datalabels (regista só uma vez)
  async function loadScript(src) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  // --- substitui ensureChartStack() ---
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
    // Carrega o ficheiro do plugin, mas NÃO regista globalmente
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

  async function getJsPDF() {
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    try {
      const mod = await import(
        "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.es.min.js"
      );
      return mod.jsPDF || window.jspdf?.jsPDF;
    } catch {
      await (async () =>
        new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src =
            "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
          s.onload = res;
          s.onerror = rej;
          document.head.appendChild(s);
        }))();
      return window.jspdf?.jsPDF;
    }
  }

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
    el.setAttribute("height", h); // altura interna
    el.style.height = px; // altura CSS
    el.style.maxHeight = px; // trava crescimento
    el.style.minHeight = px;
    el.style.display = "block";
  }
  function fixCanvasHeights() {
    lockCanvas($("#rpt-cat-pie"), 240);
    lockCanvas($("#rpt-fixed-donut"), 240);
    lockCanvas($("#rpt-series"), 260);
  }

  function openReport() {
    if (!overlay) return;
    _lastFocus = document.activeElement;
    overlay.classList.remove("hidden");
    overlay.removeAttribute("aria-hidden");
    document.body.style.overflow = "hidden";
    overlay.focus();
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

  function toggleReportInputs() {
    const t = $("#rpt-type")?.value || "monthly";
    $("#rpt-month-wrap")?.classList.toggle("hidden", t !== "monthly");
    $("#rpt-range-wrap")?.classList.toggle("hidden", t !== "range");
    $("#rpt-range2-wrap")?.classList.toggle("hidden", t !== "range");
    $("#rpt-year-wrap")?.classList.toggle("hidden", t !== "yearly");
  }
  $("#rpt-type")?.addEventListener("change", toggleReportInputs);
  toggleReportInputs();

  $("#btn-report-open")?.addEventListener("click", async () => {
    await ensureChartStack();
    openReport();
    await buildReport();
  });
  // atualizar ao mexer nos inputs do modal
  ["#rpt-month", "#rpt-from", "#rpt-to", "#rpt-year"].forEach((sel) => {
    $(sel)?.addEventListener("change", () => {
      if (!overlay?.classList.contains("hidden")) buildReport();
    });
  });

  let _rptCat = null,
    _rptFix = null,
    _rptSeries = null;
  let _catLegendPDF = [],
    _fixLegendPDF = [];
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
    _rptCat = _rptFix = _rptSeries = null;
    _catLegendPDF = [];
    _fixLegendPDF = [];
  }
  // --- substitui makeChart() ---
  function makeChart(canvasEl, config) {
    const el =
      typeof canvasEl === "string"
        ? document.querySelector(canvasEl)
        : canvasEl;
    if (!el) return null;
    const prev = Chart.getChart(el);
    if (prev) prev.destroy(); // evita "Canvas is already in use"
    return new Chart(el, config);
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

      // dados (com alias + fallback)
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
      } catch (e) {
        console.warn(
          "Select com natureza falhou; fallback simples:",
          e?.message || e
        );
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

      $("#rpt-kpi-income") &&
        ($("#rpt-kpi-income").textContent = money(income));
      $("#rpt-kpi-expense") &&
        ($("#rpt-kpi-expense").textContent = money(expense));
      $("#rpt-kpi-savings") &&
        ($("#rpt-kpi-savings").textContent = money(savings));
      $("#rpt-kpi-balance") &&
        ($("#rpt-kpi-balance").textContent = money(balance));

      // pizza por categoria (despesas)
      await ensureChartStack();
      const byCat = new Map();
      expRows.forEach((x) => {
        const name = x.category?.name || "Sem categoria";
        byCat.set(name, (byCat.get(name) || 0) + Number(x.amount || 0));
      });
      const entries = [...byCat.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12);
      const labels = entries.map(([k]) => k);
      const values = entries.map(([, v]) => v);
      const total = values.reduce((a, b) => a + b, 0);

      const showDL = !!window.ChartDataLabels && total > 0;
      _rptCat = makeChart($("#rpt-cat-pie"), {
        type: "pie",
        data: { labels, datasets: [{ data: values }] },
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
                    `${money(v)} (${((v / total) * 100).toFixed(1)}%)`,
                  display: (ctx) =>
                    (ctx.dataset.data[ctx.dataIndex] || 0) >= total * 0.05,
                }
              : { display: false },
          },
        },
      });

      const colors = _rptCat?.data?.datasets?.[0]?.backgroundColor || [];
      _catLegendPDF = labels.map((lab, i) => ({
        label: lab,
        value: values[i],
        pct: total ? values[i] / total : 0,
        color: colors[i] || "#64748b",
      }));
      const leg = $("#rpt-cat-legend");
      if (leg) {
        leg.innerHTML = _catLegendPDF
          .map(
            (x) => `
          <div class="rpt-legend__item">
            <span class="rpt-legend__dot" style="background:${x.color}"></span>
            <span style="flex:1">${x.label}</span>
            <strong>${money(x.value)}</strong>
            <span style="color:#64748b">&nbsp;(${(x.pct * 100).toFixed(
              1
            )}%)</span>
          </div>
        `
          )
          .join("");
      }

      // donut Fixas vs Variáveis
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

      // séries mensais
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
      _rptSeries = makeChart($("#rpt-series"), {
        type: "bar",
        data: {
          labels: mlabels,
          datasets: [
            { label: "Receitas", data: mlabels.map((k) => months[k].inc) },
            { label: "Despesas", data: mlabels.map((k) => months[k].exp) },
            { label: "Poupanças", data: mlabels.map((k) => months[k].sav) },
            {
              label: "Saldo",
              type: "line",
              data: mlabels.map((k) => months[k].net),
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
          }, // desativa Datalabels aqui
          scales: { y: { beginAtZero: true } },
        },
      });

      // insights
      const effort = income ? ((fixedAmt + variableAmt) / income) * 100 : 0;
      const varPct = expense ? (variableAmt / expense) * 100 : 0;
      const savPct = income ? (savings / income) * 100 : 0;
      const ins = $("#rpt-insights");
      if (ins) {
        ins.innerHTML = [
          `Taxa de esforço: ${effort.toFixed(1)}%`,
          `Despesas variáveis: ${varPct.toFixed(1)}% das despesas`,
          `Taxa de poupança: ${savPct.toFixed(1)}% das receitas`,
        ]
          .map((x) => `<li>${x}</li>`)
          .join("");
      }
    } finally {
      _isBuildingReport = false;
    }
  }

  // -------- Export PDF
  async function getJsPDF() {
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    // tenta ESM; se falhar, UMD
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

  $("#rpt-export")?.addEventListener("click", async () => {
    // garante dados/charts atualizados
    try {
      if (typeof _isBuildingReport !== "undefined" && !_isBuildingReport)
        await buildReport();
    } catch {}

    const jsPDF = await getJsPDF();
    if (!jsPDF) return alert("Falhou a carregar o gerador de PDF.");

    // ======= CONFIGURÁVEL PELO DEV =======
    const REPORT_CFG = {
      title: ($("#rpt-title")?.textContent || "Relatório Financeiro").trim(),
      author: "António R. Appleton",
      subject: "Relatório Financeiro",
      creator: "WiseBudget®",
      filename: "wisebudget-relatorio.pdf",
      showDetailsPage: true, // 2ª página com detalhe por categoria
      signature: {
        enabled: true,
        name: "Finance Dept.",
        textFallback: "________________________",
        // Se tiveres um PNG/SVG local (mesmo domínio), mete o caminho:
        imageUrl: null, // ex: "/assets/signature.png"
        // medidas da assinatura (em pontos)
        width: 140,
        height: 60,
      },
    };
    // =====================================

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 40;
    let y = M;

    // metadata
    doc.setProperties({
      title: REPORT_CFG.title,
      subject: REPORT_CFG.subject,
      author: REPORT_CFG.author,
      creator: REPORT_CFG.creator,
      keywords: "finance, report, wisebudget",
    });

    // helpers de layout
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
      const txt = "Relatório automáticamente por WiseBudget®";
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
    // desenha cabeçalho inicial
    header(REPORT_CFG.title, new Date().toLocaleString("pt-PT"));

    // ======= KPIs =======
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

    // ======= GRÁFICOS (1ª página) =======
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
        const color = it?.color || "#888";
        const pct = ((it?.pct || 0) * 100).toFixed(1);
        const label = it?.label || "—";
        const val = it?.value ?? 0;
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

    // títulos dos blocos
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

    // lendas
    const yLegL = drawLegend(window._catLegendPDF || _catLegendPDF, M, y, colW);
    const yLegR = drawLegend(
      window._fixLegendPDF || _fixLegendPDF,
      M + colW + 16,
      y,
      colW
    );
    y = Math.max(yLegL, yLegR) + 16;

    // séries
    ensureSpace(260 + 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Séries mensais", M, y);
    y += 10;
    y = canvasToPage("#rpt-series", M, y, W - 2 * M, 240) + 12;

    // ======= PÁGINA DE DETALHE (opcional) =======
    if (REPORT_CFG.showDetailsPage) {
      footer();
      doc.addPage();
      y = M;
      header("Detalhe — Categorias", new Date().toLocaleDateString("pt-PT"));

      // tabela simples (categoria | € | %)
      const rows = window._catLegendPDF || _catLegendPDF || [];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Categoria", M, y);
      doc.text("Montante", W - M - 160, y);
      doc.text("%", W - M - 40, y, { align: "right" });
      y += 8;
      line(M, y, W - M, y);
      y += 10;
      doc.setFont("helvetica", "normal");

      rows.forEach((r) => {
        ensureSpace(16);
        doc.text(String(r.label || "—"), M, y, { maxWidth: W - 2 * M - 220 });
        const val =
          "€ " +
          Number(r.value || 0).toLocaleString("pt-PT", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        doc.text(val, W - M - 160, y);
        doc.text(((r.pct || 0) * 100).toFixed(1) + "%", W - M - 40, y, {
          align: "right",
        });
        y += 14;
      });
    }

    // ======= ASSINATURA (opcional) =======
    if (REPORT_CFG.signature?.enabled) {
      ensureSpace(120);
      const sig = REPORT_CFG.signature;
      const blockTop = Math.max(y, H - M - 110); // empurra para perto do fim
      y = blockTop;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("Assinatura", M, y);
      y += 6;
      doc.setDrawColor(210);
      line(M, y, M + 200, y);
      y += 8;

      // tenta imagem; se não houver, usa texto fallback
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

    // ======= PAGINAÇÃO + RODAPÉ EM TODAS =======
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      // numeração
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Página ${i} de ${pageCount}`, W - M, H - M + 12, {
        align: "right",
      });
      // rodapé
      doc.setTextColor(120);
      doc.text("Relatório automáticamente por WiseBudget®", M, H - M + 12);
      doc.setTextColor(0);
    }

    // guarda
    doc.save(REPORT_CFG.filename);
  });

  // ================== /RELATÓRIOS ========================

  // ============ MANUTENÇÃO DE DADOS =====================
  $("#btn-del-month")?.addEventListener("click", async () => {
    try {
      await preflight();
      const start = currentMonthStartISO(),
        end = nextMonthStartISO();
      if (!confirm(`Eliminar todas as transações de ${start.slice(0, 7)}?`))
        return;
      await sb.from("transactions").delete().gte("date", start).lt("date", end);
      alert("Mês eliminado.");
    } catch (e) {
      alert(e.message || "Falha de ligação.");
    }
  });

  $("#btn-del-range")?.addEventListener("click", async () => {
    try {
      await preflight();
      const startISO = prompt("Início (YYYY-MM-DD):", currentMonthStartISO());
      const endISO = prompt("Fim EXCLUSIVO (YYYY-MM-DD):", nextMonthStartISO());
      if (!startISO || !endISO) return;
      if (
        !confirm(
          `Eliminar transações de ${startISO} até ${endISO} (exclusivo)?`
        )
      )
        return;
      await sb
        .from("transactions")
        .delete()
        .gte("date", startISO)
        .lt("date", endISO);
      alert("Período eliminado.");
    } catch (e) {
      alert(e.message || "Falha de ligação.");
    }
  });

  $("#btn-del-all")?.addEventListener("click", async () => {
    try {
      await preflight();
      if (!confirm("Eliminar TODAS as suas transações?")) return;
      await sb
        .from("transactions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      alert("Tudo eliminado.");
    } catch (e) {
      alert(e.message || "Falha de ligação.");
    }
  });

  // Regularidade em massa
  async function pickRegularityId(
    promptText = "Regularidade (ex: mensal, quinzenal, anual, única)"
  ) {
    const s = (prompt(promptText) || "").trim();
    if (!s) return null;
    const id = regularityFromLabel(s);
    if (!id) alert("Regularidade não reconhecida.");
    return id;
  }
  async function bulkSetRegularityForMonth(
    yyyyMM,
    regId,
    categoryPath /* opcional */
  ) {
    const [y, m] = yyyyMM.split("-").map(Number);
    const from = ymd(new Date(y, m - 1, 1));
    const to = ymd(new Date(y, m, 1));
    let q = sb
      .from("transactions")
      .update({ regularity_id: regId })
      .gte("date", from)
      .lt("date", to);

    if (categoryPath) {
      const [par, chi] = categoryPath.split(">").map((s) => s.trim());
      let catId = null;
      if (par && chi) {
        const { data: parent } = await sb
          .from("categories")
          .select("id")
          .eq("name", par)
          .is("parent_id", null)
          .limit(1);
        if (parent?.[0]) {
          const { data: child } = await sb
            .from("categories")
            .select("id")
            .eq("name", chi)
            .eq("parent_id", parent[0].id)
            .limit(1);
          catId = child?.[0]?.id || null;
        }
      } else if (par) {
        const { data: only } = await sb
          .from("categories")
          .select("id")
          .eq("name", par)
          .is("parent_id", null)
          .limit(1);
        catId = only?.[0]?.id || null;
      }
      if (catId) q = q.eq("category_id", catId);
    }
    const { error } = await q;
    if (error) throw error;
  }
  $("#btn-regularity-bulk")?.addEventListener("click", async () => {
    try {
      await preflight();
      const month = prompt(
        "Mês (YYYY-MM):",
        new Date().toISOString().slice(0, 7)
      );
      if (!month) return;
      const regId = await pickRegularityId(
        "Regularidade (mensal, quinzenal, anual, única):"
      );
      if (!regId) return;
      const catPath = prompt(
        'Categoria opcional (ex: "Casa > Renda"; vazio = todas):',
        ""
      );
      await bulkSetRegularityForMonth(month, regId, catPath || null);
      alert("Regularidade atualizada.");
    } catch (e) {
      alert(e.message || "Falha de ligação.");
    }
  });

  // ============ CATEGORIAS & CONTAS (CRUD) ==============
  async function listCategories() {
    const uid = await getUserId();
    const { data, error } = await sb
      .from("categories")
      .select("id,name,parent_id,user_id")
      .eq("user_id", uid);
    if (error) {
      console.error(error);
      return [];
    }
    const all = data || [];
    const parents = all.filter((c) => !c.parent_id);
    const children = all.filter((c) => c.parent_id);

    const groups = new Map(); // key -> { name, parentIds:[], parentId }
    parents.forEach((p) => {
      const k = normalizeKey(p.name);
      if (!groups.has(k))
        groups.set(k, { name: p.name, parentIds: [], parentId: p.id });
      const g = groups.get(k);
      g.parentIds.push(p.id);
      if (!g.parentId) g.parentId = p.id;
    });

    const result = [];
    for (const g of groups.values()) {
      const subsAll = children.filter((s) => g.parentIds.includes(s.parent_id));
      const seen = new Map();
      subsAll.forEach((s) => {
        const ks = normalizeKey(s.name);
        if (!seen.has(ks)) seen.set(ks, { id: s.id, name: s.name });
      });
      result.push({
        id: g.parentId,
        name: g.name,
        subs: Array.from(seen.values()),
      });
    }
    result.sort((a, b) =>
      new Intl.Collator("pt-PT", { sensitivity: "base" }).compare(
        a.name,
        b.name
      )
    );
    return result;
  }
  async function createCategory(parentId, name) {
    const uid = await getUserId();
    await sb
      .from("categories")
      .insert({ name, parent_id: parentId || null, user_id: uid });
    window.dispatchEvent(new Event("categories:changed"));
  }
  async function renameCategory(id, name) {
    await sb.from("categories").update({ name }).eq("id", id);
    window.dispatchEvent(new Event("categories:changed"));
  }
  async function deleteCategory(id) {
    const { count } = await sb
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("category_id", id);
    if ((count || 0) > 0)
      return alert("Categoria com movimentos. Mova/apague primeiro.");
    await sb.from("categories").delete().eq("id", id);
    window.dispatchEvent(new Event("categories:changed"));
  }
  async function renderCategories() {
    const el = $("#list-cats");
    if (!el) return;
    const tree = await listCategories();
    el.innerHTML = tree
      .map(
        (p) => `
      <div class="row" style="display:flex;justify-content:space-between;gap:10px;border:1px solid #e5e7eb;border-radius:12px;padding:12px">
        <div>
          <strong>${p.name}</strong>
          ${
            p.subs.length
              ? `<div class="row-note">Subcategorias: ${p.subs
                  .map((s) => s.name)
                  .join(", ")}</div>`
              : ""
          }
        </div>
        <div class="actions" style="gap:6px;display:flex">
          <button data-edit="${p.id}" class="btn">Renomear</button>
          <button data-newsub="${p.id}" class="btn">Nova Sub</button>
          <button data-del="${p.id}" class="btn">Apagar</button>
        </div>
      </div>`
      )
      .join("");

    el.querySelectorAll("[data-newsub]").forEach(
      (b) =>
        (b.onclick = async () => {
          const name = prompt("Nome da subcategoria:");
          if (!name) return;
          await createCategory(b.dataset.newsub, name);
          renderCategories();
        })
    );
    el.querySelectorAll("[data-edit]").forEach(
      (b) =>
        (b.onclick = async () => {
          const name = prompt("Novo nome:");
          if (!name) return;
          await renameCategory(b.dataset.edit, name);
          renderCategories();
        })
    );
    el.querySelectorAll("[data-del]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm("Apagar categoria?")) return;
          await deleteCategory(b.dataset.del);
          renderCategories();
        })
    );
  }

  async function listAccounts() {
    const { data } = await sb
      .from("accounts")
      .select("id,name,currency,type")
      .order("name");
    return data || [];
  }
  async function createAccount(name, currency = "EUR", type = "bank") {
    const uid = await getUserId();
    await sb.from("accounts").insert({ name, currency, type, user_id: uid });
    window.dispatchEvent(new Event("accounts:changed"));
  }
  async function renameAccount(id, name) {
    await sb.from("accounts").update({ name }).eq("id", id);
    window.dispatchEvent(new Event("accounts:changed"));
  }
  async function deleteAccount(id) {
    const { count } = await sb
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("account_id", id);
    if ((count || 0) > 0)
      return alert("Conta com movimentos. Transfira/apague primeiro.");
    await sb.from("accounts").delete().eq("id", id);
    window.dispatchEvent(new Event("accounts:changed"));
  }
  async function renderAccounts() {
    const el = $("#list-accs");
    if (!el) return;
    const accs = await listAccounts();
    el.innerHTML = accs
      .map(
        (a) => `
      <div class="row" style="display:flex;justify-content:space-between;gap:10px;border:1px solid #e5e7eb;border-radius:12px;padding:12px">
        <div>
          <strong>${a.name}</strong>
          <div class="row-note">Tipo: ${a.type || "bank"} • Moeda: ${
          a.currency
        }</div>
        </div>
        <div class="actions" style="gap:6px;display:flex">
          <button data-edit="${a.id}" class="btn">Renomear</button>
          <button data-del="${a.id}" class="btn">Apagar</button>
        </div>
      </div>`
      )
      .join("");

    el.querySelectorAll("[data-edit]").forEach(
      (b) =>
        (b.onclick = async () => {
          const name = prompt("Novo nome da conta:");
          if (!name) return;
          await renameAccount(b.dataset.edit, name);
          renderAccounts();
        })
    );
    el.querySelectorAll("[data-del]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm("Apagar conta?")) return;
          await deleteAccount(b.dataset.del);
          renderAccounts();
        })
    );
  }

  // Botões “Novo …”
  $("#btn-new-cat")?.addEventListener("click", async () => {
    const parent = prompt("Área (vazio para categoria raiz):", "");
    const name = prompt("Nome da categoria/subcategoria:", "");
    if (!name) return;
    let parentId = null;
    if (parent) {
      const { data: p } = await sb
        .from("categories")
        .select("id")
        .eq("name", parent)
        .is("parent_id", null)
        .maybeSingle();
      parentId = p?.id ?? null;
      if (!parentId) {
        await createCategory(null, parent);
        const again = await sb
          .from("categories")
          .select("id")
          .eq("name", parent)
          .is("parent_id", null)
          .maybeSingle();
        parentId = again.data?.id || null;
      }
    }
    await createCategory(parentId, name);
    renderCategories();
  });
  $("#btn-new-acc")?.addEventListener("click", async () => {
    const name = prompt("Nome da conta:", "Conta Secundária");
    if (!name) return;
    await createAccount(name);
    renderAccounts();
  });

  // arranque
  renderCategories();
  renderAccounts();
}
