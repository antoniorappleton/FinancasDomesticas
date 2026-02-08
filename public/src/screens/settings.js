// src/screens/settings.js

import { repo } from "../lib/repo.js";
import { exportImportTemplate } from "./export-template.js";
import { saveTheme as saveGlobalTheme } from "../lib/theme.js";

export async function init({ sb, outlet } = {}) {
  // Import do gerador de template

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

  // Check for password reset action
  setTimeout(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1]);
    if (params.get("action") === "reset_password") {
      const sec = document.getElementById("sec-password");
      if (sec) {
        sec.scrollIntoView({ behavior: "smooth" });
        sec.style.border = "2px solid var(--ui-fab-bg)"; // Highlight
        const inp = document.getElementById("set-new-pass");
        if (inp) inp.focus();
        Toast.info("Define a tua nova palavra-passe aqui.");
      }
    }
  }, 500);

  const $ = (sel) =>
    (outlet && outlet.querySelector(sel)) || document.querySelector(sel);

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
        "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
      );
    }
    if (!window.ChartDataLabels && !window.__loadingCDL__) {
      window.__loadingCDL__ = true;
      try {
        await loadScript(
          "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js",
        );
      } finally {
        window.__loadingCDL__ = false;
      }
    }
    // regista plugin se existir
    if (window.Chart && window.ChartDataLabels && !window.__cdlRegistered__) {
      window.Chart.register(window.ChartDataLabels);
      window.__cdlRegistered__ = true;
    }
  }
  async function getJsPDF() {
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    try {
      const mod =
        await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.es.min.js");
      return mod.jsPDF || window.jspdf?.jsPDF;
    } catch {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
      );
      return window.jspdf?.jsPDF;
    }
  }

  // ===== helpers de legenda/cores (para charts e PDF) =====
  function palette(n) {
    const base = [
      "#0ea5e9",
      "#22c55e",
      "#f97316",
      "#a78bfa",
      "#ef4444",
      "#14b8a6",
      "#eab308",
      "#06b6d4",
      "#f472b6",
      "#94a3b8",
      "#10b981",
      "#3b82f6",
    ];
    if (n <= base.length) return base.slice(0, n);
    const out = [];
    for (let i = 0; i < n; i++) out.push(base[i % base.length]);
    return out;
  }
  function legendHTML(items) {
    return (items || [])
      .map(
        (it) => `
      <div class="rpt-legend__item">
        <span class="rpt-legend__dot" style="background:${it.color}"></span>
        <span style="flex:1">${it.label}</span>
        <strong>${money(it.value)}</strong>
        ${
          typeof it.pct === "number"
            ? `<span style="color:#64748b">&nbsp;(${(it.pct * 100).toFixed(
                1,
              )}%)</span>`
            : ""
        }
      </div>`,
      )
      .join("");
  }

  // util: carrega imagem e devolve dataURL
  async function toDataURL(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("IMG not found");
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });
  }

  //==== Mini cards ocultos na dashboard =====//
  // ===== MINI-CARDS SHELF (sincroniza com localStorage que a Dashboard usa) =====
  const HIDDEN_KEY = "wb:hiddenMiniCards";
  function getHiddenCards() {
    try {
      return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function setHiddenCards(arr) {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(arr || []));
  }
  function unhideCard(key) {
    setHiddenCards(getHiddenCards().filter((x) => x.key !== key));
    // notificar outras páginas/ecrãs
    window.dispatchEvent(
      new CustomEvent("wb:minicard:changed", {
        detail: { action: "unhide", key },
      }),
    );
  }
  function renderMiniShelf(root = document) {
    const shelf = root.querySelector("#mini-shelf");
    if (!shelf) return;
    const data = getHiddenCards();
    shelf.innerHTML = data.length
      ? ""
      : "<div class='muted'>Nenhum mini-card oculto.</div>";
    data.forEach(({ key, title }) => {
      const chip = document.createElement("div");
      chip.className = "mini-shelf__chip";
      chip.innerHTML = `<span>${title || key}</span>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Mostrar";
      btn.title = "Voltar a mostrar na Dashboard";
      btn.addEventListener("click", () => {
        unhideCard(key);
        renderMiniShelf(root);
      });
      chip.appendChild(btn);
      shelf.appendChild(chip);
    });
  }

  // ================= Regularidades ======================
  const { data: regs } = await sb
    .from("regularities")
    .select("id,code,name_pt");
  const REG_BY_LABEL = new Map();
  const REG_LABEL_BY_ID = new Map();
  (regs || []).forEach((r) => {
    const codeKey = (r.code || "").toLowerCase();
    const nameKey = (r.name_pt || "").toLowerCase();
    REG_BY_LABEL.set(codeKey, r.id);
    if (nameKey) REG_BY_LABEL.set(nameKey, r.id);
    REG_LABEL_BY_ID.set(r.id, r.name_pt || r.code || String(r.id));
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
        s,
      )
    )
      return REG_BY_LABEL.get("monthly");
    if (/(iuc|inspe[cç][aã]o|im[ií]vel|seguro.*sa[úu]de|f[eé]rias)/.test(s))
      return REG_BY_LABEL.get("yearly");
    return null;
  }

  // =============== IMPORTAÇÃO SMART (PDF/CSV) =======================

  // Config e State
  let parsedItems = [];
  let importCatOptions = "";

  // Smart Indexing
  let importCategories = [];
  let catById = new Map();
  let leafCatsExpense = [];
  let leafCatsIncome = [];
  let leafCatsSavings = [];

  // Helpers
  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findLeafByNameIncludes(kind, needle) {
    const n = norm(needle);
    const pool =
      kind === "expense"
        ? leafCatsExpense
        : kind === "income"
          ? leafCatsIncome
          : leafCatsSavings;
    return pool.find((c) => norm(c.name).includes(n)) || null;
  }

  function findLeafExact(kind, exactName) {
    const pool =
      kind === "expense"
        ? leafCatsExpense
        : kind === "income"
          ? leafCatsIncome
          : leafCatsSavings;
    const ex = norm(exactName);
    return pool.find((c) => norm(c.name) === ex) || null;
  }

  function guessCategoryForLine(description, amount) {
    const d = norm(description);
    const isIncome = amount > 0;
    const isSavings = /poupeup/.test(d);

    // 1) Internal/Savings
    // --- PoupeUp (FORÇAR: TRF P/ = Saída | TRF DE = Entrada) ---
    // TRF DE PoupeUp -> Entrada (INCOME) -> sugerir "Extras" (editável)
    if (/trf\s+de\s+poupeup/.test(d)) {
      const extras = findLeafByNameIncludes("income", "Extras");
      return extras
        ? { id: extras.id, confidence: 0.75, skip: false, forceType: "INCOME" }
        : { id: null, confidence: 0.4, skip: false, forceType: "INCOME" };
    }

    // TRF P/ PoupeUp -> Saída (EXPENSE) -> sugerir "Outro(s)" (editável)
    if (/trf\s+p\/\s*poupeup/.test(d) || /trf\s+p\s+poupeup/.test(d)) {
      const other =
        findLeafByNameIncludes("expense", "Outro") ||
        findLeafByNameIncludes("expense", "Outros");
      return other
        ? { id: other.id, confidence: 0.65, skip: false, forceType: "EXPENSE" }
        : { id: null, confidence: 0.35, skip: false, forceType: "EXPENSE" };
    }

    // "TRF P/ PoupeUp" -> Poupança (savings) - REMOVIDO EM FAVOR DO FORCE EXPENSE ACIMA
    if (/trf\s+p\/\s*poupeup/.test(d) || /trf\s+p\s+poupeup/.test(d)) {
      const pouLeaf = findLeafExact("savings", "Poupança");
      return pouLeaf
        ? { id: pouLeaf.id, confidence: 0.95, skip: false }
        : { id: null, confidence: 0.2, skip: false };
    }

    if (isSavings) {
      // fallback for other savings if any
      return { id: null, confidence: 0.2 };
    }

    // 2) Income
    if (isIncome) {
      if (/vencimento|ordenado|salary/.test(d)) {
        const cat = findLeafByNameIncludes("income", "Ordenado");
        return cat
          ? { id: cat.id, confidence: 0.95 }
          : { id: null, confidence: 0.2 };
      }
      if (/explic/.test(d)) {
        const cat = findLeafByNameIncludes("income", "Explicações");
        return cat
          ? { id: cat.id, confidence: 0.9 }
          : { id: null, confidence: 0.2 };
      }
      const extras = findLeafByNameIncludes("income", "Extras");
      return extras
        ? { id: extras.id, confidence: 0.6 }
        : { id: null, confidence: 0.2 };
    }

    // 3) Expenses
    if (/(galp|bp|repsol|cepsa|combust|gasolina|diesel)/.test(d)) {
      const cat = findLeafByNameIncludes("expense", "Combustível");
      return cat
        ? { id: cat.id, confidence: 0.9 }
        : { id: null, confidence: 0.2 };
    }
    if (/(via verde|viaverde|portag|estacion)/.test(d)) {
      const cat = findLeafByNameIncludes(
        "expense",
        "Via Verde/Estacionamentos/Portagens",
      );
      return cat
        ? { id: cat.id, confidence: 0.9 }
        : { id: null, confidence: 0.2 };
    }
    if (/\bemel\b/.test(d)) {
      const cat = findLeafByNameIncludes("expense", "EMEL");
      return cat
        ? { id: cat.id, confidence: 0.9 }
        : { id: null, confidence: 0.2 };
    }
    if (
      /(continente|pingo doce|lidl|aldi|auchan|intermarche|supermerc)/.test(d)
    ) {
      const cat = findLeafByNameIncludes("expense", "Supermercado");
      return cat
        ? { id: cat.id, confidence: 0.9 }
        : { id: null, confidence: 0.2 };
    }
    if (/(restaurante|cafe|pastelaria|bar)/.test(d)) {
      const r = findLeafByNameIncludes("expense", "Restaurantes");
      if (r) return { id: r.id, confidence: 0.75 };
      const c = findLeafByNameIncludes("expense", "Cafés/Bar de rua");
      return c ? { id: c.id, confidence: 0.7 } : { id: null, confidence: 0.2 };
    }
    if (/(nos|vodafone|meo)/.test(d)) {
      const nos = findLeafByNameIncludes("expense", "NOS");
      if (nos) return { id: nos.id, confidence: 0.85 };
      const tel = findLeafByNameIncludes("expense", "Telemóvel");
      return tel
        ? { id: tel.id, confidence: 0.7 }
        : { id: null, confidence: 0.2 };
    }
    if (/(edp|gold energy|electric|energia|gas)/.test(d)) {
      const cat = findLeafByNameIncludes("expense", "Luz + Gás");
      return cat
        ? { id: cat.id, confidence: 0.8 }
        : { id: null, confidence: 0.2 };
    }
    if (/(epal|agua)/.test(d)) {
      const cat = findLeafByNameIncludes("expense", "Àgua");
      return cat
        ? { id: cat.id, confidence: 0.8 }
        : { id: null, confidence: 0.2 };
    }
    if (
      /(farmacia|medic|hospital|clinica|consulta|fisioter|pilates|seguro de saude)/.test(
        d,
      )
    ) {
      const med = findLeafByNameIncludes("expense", "Medicamentos");
      if (med && /(farmacia|medic)/.test(d))
        return { id: med.id, confidence: 0.8 };
      const cons = findLeafByNameIncludes("expense", "Consultas Médicas");
      if (cons && /(consulta|clinica|hospital)/.test(d))
        return { id: cons.id, confidence: 0.75 };
      const fisio = findLeafByNameIncludes("expense", "Fisioterapia");
      if (fisio && /fisioter/.test(d)) return { id: fisio.id, confidence: 0.8 };
      const seg = findLeafByNameIncludes("expense", "Seguro de Saúde");
      if (seg && /seguro/.test(d)) return { id: seg.id, confidence: 0.8 };
      const saude = findLeafByNameIncludes("expense", "Saúde");
      return saude
        ? { id: saude.id, confidence: 0.55 }
        : { id: null, confidence: 0.2 };
    }

    const other =
      findLeafByNameIncludes("expense", "Outro") ||
      findLeafByNameIncludes("expense", "Outros");
    return other
      ? { id: other.id, confidence: 0.35 }
      : { id: null, confidence: 0.2 };
  }

  function resolveExpenseNature(catObj, description) {
    if (!catObj) return null; // If no category, we default to resolve later or variable
    if (catObj.kind !== "expense") return null;

    // 1) Direct on category
    if (catObj.nature === "fixed" || catObj.nature === "variable")
      return catObj.nature;

    // 2) Heuristics (Description) - "Mixed parent" fix (PRIORITY OVER PARENT)
    // Heuristics: DD, Seguro, Mensal, Renda, Prestação
    const d = String(description || "").toLowerCase();
    if (
      /\bdd\b|\bdebito direto\b|\bseguro\b|\bmensal\b|\brenda\b|\bprestacao\b/.test(
        d,
      )
    )
      return "fixed";

    // 3) Inherit from parent (Lower priority)
    const parent = catObj.parent_id ? catById.get(catObj.parent_id) : null;
    if (parent?.nature === "fixed" || parent?.nature === "variable")
      return parent.nature;

    // 4) Existing Regularity Heuristic
    const regId = inferRegularity(parent?.name, catObj.name);
    if (regId) return "fixed";

    // 5) Fallback
    return "variable";
  }

  function normalizeDescription(raw) {
    let s = String(raw || "").trim();
    // Basic cleanup
    s = s.replace(
      /^(COMPRA|PAGAMENTO|MB WAY|TRANSF\.?|DEBITO|CREDITO)\s+/i,
      "",
    );
    s = s.replace(/\s+(TERM|TERM\.|TERMINAL)\s+\d+/i, "");
    s = s.replace(/\s+DATA\s+\d{2}[-/]\d{2}/i, "");
    s = s.replace(/\s+\d{2}[:]\d{2}/, "");
    s = s.replace(/\s+PT$/i, "");
    s = s.replace(/\s+/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  // Load Categories (Lazy)
  async function loadImportCategories() {
    if (importCatOptions && importCategories.length) return;

    // Fetch
    const { data } = await sb
      .from("categories")
      .select("id,name,parent_id,kind,nature,expense_nature_default")
      .order("name");
    if (!data) return;

    importCategories = data;
    catById = new Map(data.map((c) => [c.id, c]));

    // Build Indexes
    const hasChild = new Set(
      importCategories.map((c) => c.parent_id).filter(Boolean),
    );
    const leaves = importCategories.filter((c) => !hasChild.has(c.id));

    leafCatsExpense = leaves.filter((c) => c.kind === "expense");
    leafCatsIncome = leaves.filter((c) => c.kind === "income");
    leafCatsSavings = leaves.filter((c) => c.kind === "savings");

    // Build Select HTML
    const parents = data.filter((c) => !c.parent_id);
    const children = data.filter((c) => c.parent_id);

    let html = '<option value="">(Sem categoria)</option>';

    parents.forEach((p) => {
      html += `<optgroup label="${escapeHtml(p.name)}">`;
      html += `<option value="${p.id}">${escapeHtml(p.name)} (Geral)</option>`;
      children
        .filter((c) => c.parent_id === p.id)
        .forEach((c) => {
          html += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
        });
      html += `</optgroup>`;
    });
    importCatOptions = html;
  }

  // Populate Account Select
  async function loadAccounts() {
    const sel = $("#imp-account");
    if (!sel || sel.children.length > 0) return;
    const { data } = await sb.from("accounts").select("id,name").order("name");
    if (data) {
      sel.innerHTML = data
        .map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`)
        .join("");
      // Select "Conta Principal" if exists
      const prim = data.find((a) => a.name.includes("Principal"));
      if (prim) sel.value = prim.id;
    }
  }

  // === PARSERS ===
  // CSV Parser (Generic)
  async function parseCSV(file) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const res = [];
    const sep = text.includes(";") ? ";" : ",";

    lines.forEach((line) => {
      if (line.length < 5) return;
      const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));

      const dateIdx = cols.findIndex((c) =>
        /^\d{2,4}[-/]\d{2}[-/]\d{2,4}$/.test(c),
      );
      if (dateIdx === -1) return;

      const amountCols = cols.map((c, i) => {
        if (i === dateIdx) return null;
        const clean = c.replace(/[€\s]/g, "").replace(",", ".");
        return !isNaN(Number(clean)) && c.length > 0 ? Number(clean) : null;
      });

      const validAmtIdx = amountCols.findIndex((v) => v !== null && v !== 0);
      let amount = 0;
      if (validAmtIdx !== -1) {
        amount = amountCols[validAmtIdx];
      } else {
        return;
      }

      const strCols = cols.filter(
        (c, i) => i !== dateIdx && i !== validAmtIdx && c.length > 2,
      );
      let desc = strCols.join(" ") || "Movimento Importado";

      let dStr = cols[dateIdx];
      if (dStr.match(/^\d{2}[-/]\d{2}[-/]\d{4}$/)) {
        const [d, m, y] = dStr.split(/[-/]/);
        dStr = `${y}-${m}-${d}`;
      }

      res.push({
        date: dStr,
        amount: amount,
        description: desc,
        selected: true,
      });
    });
    return res;
  }

  // === ACTIVO BANK PARSER HELPERS ===
  function parseMoneyPt(s) {
    // "1 955.26" -> 1955.26
    return Number(String(s).replace(/\s+/g, "").replace(",", "."));
  }

  function isNoiseLine(u) {
    return (
      u.includes("SALDO INICIAL") ||
      u.includes("SALDO FINAL") ||
      u.includes("SALDO DISPONIVEL") ||
      u.startsWith("A TRANSPORTAR") ||
      u.startsWith("TRANSPORTE") ||
      u.includes("ULTRAPASSAGEM DE CREDITO") ||
      u.startsWith("DATA") ||
      u.startsWith("LANC") ||
      u.startsWith("VALOR") ||
      u.startsWith("DESCRITIVO") ||
      u.startsWith("DEBITO") ||
      u.startsWith("CREDITO") ||
      u.startsWith("SALDO")
    );
  }

  function parseActivoBankDateMD(token, year) {
    // "1.30" -> 2026-01-30
    const m = token.match(/^(\d{1,2})\.(\d{2})$/);
    if (!m) return null;
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (!month || !day) return null;
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }

  function inferSignFromText(descUpper) {
    if (
      descUpper.startsWith("CRED.") ||
      descUpper.includes("TRANSFERENCIA - VENCIMENTO") ||
      descUpper.includes("PAGAMENTO DE VENCIMENTO") ||
      descUpper.includes("TRF DE ") ||
      descUpper.includes("TRF MB WAY DE ")
    )
      return +1;
    return -1; // Default expense
  }

  // PDF Parser using pdf.js -> ActivoBank Logic
  // PDF Parser using pdf.js -> ActivoBank Logic (Geometric + Text)
  async function parsePDF(file) {
    if (!window.pdfjsLib) {
      throw new Error("Biblioteca PDF não carregada. Verifique a internet.");
    }

    // Ensure worker is configured (fail-safe)
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    try {
      setImpInfo("A carregar PDF na memória...");
      const arrayBuffer = await file.arrayBuffer();

      setImpInfo("A analisar estrutura do PDF...");
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setImpInfo(`PDF carregado. ${pdf.numPages} páginas.`);

      const res = [];
      let fullTextDebug = [];
      let totalPDFTextItems = 0; // Para detetar scanned/imagem

      // Coordinates for columns (discovered dynamically)
      let xDebit = 0;
      let xCredit = 0;

      for (let i = 1; i <= pdf.numPages; i++) {
        setImpInfo(`A ler página ${i}/${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        if (textContent && textContent.items) {
          totalPDFTextItems += textContent.items.length;
        }

        // 1. Get Items with Coords
        const items = textContent.items
          .map((item) => ({
            str: item.str,
            clean: item.str.trim(),
            x: item.transform[4],
            y: item.transform[5],
            w: item.width,
          }))
          .sort((a, b) => {
            // Sort by Y (desc) then X (asc)
            if (Math.abs(a.y - b.y) < 5) return a.x - b.x;
            return b.y - a.y;
          });

        // 2. Discover Headers (if not yet found or refine)
        // ActivoBank headers: "DÉBITO" and "CRÉDITO"
        const debitItem = items.find((it) => /D[EÉ]BITO/i.test(it.clean));
        const creditItem = items.find((it) => /CR[EÉ]DITO/i.test(it.clean));

        if (debitItem) xDebit = debitItem.x;
        if (creditItem) xCredit = creditItem.x;

        // 3. Group into lines
        const lines = [];
        let currentLine = null;
        for (const it of items) {
          if (!it.clean) continue;
          if (!currentLine || Math.abs(currentLine.y - it.y) > 5) {
            currentLine = { y: it.y, items: [it], text: it.str };
            lines.push(currentLine);
          } else {
            currentLine.items.push(it);
            currentLine.text += "  " + it.str;
          }
        }

        // Add to debug log
        fullTextDebug.push(...lines.map((l) => l.text));

        // 4. Extract Year (Page Context)
        // Try to find "EXTRATO DE 202X..."
        let pageYear = new Date().getFullYear();
        const yearLine = lines.find((l) =>
          /EXTRATO.*(\d{4})\/\d{2}\/\d{2}/i.test(l.text),
        );
        if (yearLine) {
          const m = yearLine.text.match(/(\d{4})\/\d{2}\/\d{2}/);
          if (m) pageYear = Number(m[1]);
        }

        // 5. Detect Transactions
        const moneyRegex = /(\d{1,3}(?:\s\d{3})*(?:[.,]\d{2}))/g;

        for (const line of lines) {
          const raw = line.text;
          const u = raw.toUpperCase().trim();
          if (isNoiseLine(u)) continue;

          // Pattern: DD.MM  DD.MM  DESCRIPTION ...
          const mDate = raw
            .trim()
            .match(/^(\d{1,2}\.\d{2})\s+(\d{1,2}\.\d{2})\s+(.+)$/);
          if (!mDate) continue;

          const dateToken = mDate[1];
          const rest = mDate[3];

          // Find money values
          const monies = [...raw.matchAll(moneyRegex)].map((x) => x[1]);
          if (monies.length === 0) continue;

          // Logic: Last is Balance, 2nd-Last is Amount
          const targetMoneyStr =
            monies.length >= 2 ? monies[monies.length - 2] : monies[0];
          const mov = parseMoneyPt(targetMoneyStr);
          if (!Number.isFinite(mov)) continue;

          // Determine Sign (Debit vs Credit)
          const amountItem = line.items.find((it) =>
            it.str.includes(targetMoneyStr),
          );

          let sign = -1; // Default to expense

          // Geometric Check
          if (amountItem && xDebit > 0 && xCredit > 0) {
            const mid = (xDebit + xCredit) / 2;
            if (amountItem.x > mid) {
              sign = 1; // Credit (Right)
            } else {
              sign = -1; // Debit (Left)
            }
          } else {
            // Fallback: Text Heuristic
            let cleanDesc = rest.replace(moneyRegex, "");
            sign = inferSignFromText(cleanDesc.toUpperCase());
          }

          // Clean Description
          let desc = rest
            .replace(moneyRegex, "")
            .replace(/\s{2,}/g, " ")
            .trim();
          if (desc.length < 3) continue;

          const isoDate = parseActivoBankDateMD(dateToken, pageYear);
          if (!isoDate) continue;

          res.push({
            date: isoDate,
            amount: mov * sign,
            description: normalizeDescription(desc),
            selected: true,
          });
        }
      }

      console.log("PDF Extracted Lines (Debug):", fullTextDebug);

      if (res.length === 0) {
        const info = document.getElementById("imp-info");

        // Detetar se é digitalização
        if (totalPDFTextItems < 50) {
          if (info)
            info.innerHTML =
              "<b>Atenção:</b> Este PDF parece ser uma digitalização (imagem).<br>A app precisa de texto selecionável. Tente exportar o extrato como CSV ou PDF original (não 'Digitalizar').";
          return [];
        }

        const dbg =
          "<br><b>Debug (5 linhas):</b><br>" +
          fullTextDebug.slice(0, 5).map(escapeHtml).join("<br>");
        if (info)
          info.innerHTML = "Não encontrei movimentos ActivoBank. " + dbg;
      }

      return res;
    } catch (e) {
      throw e;
    }
  }

  // === UI & INTERACTION ===

  // Render List
  async function renderReviewList() {
    const area = $("#imp-review-area");
    const list = $("#imp-list");
    const info = $("#imp-info");
    const btnConf = $("#imp-confirm");

    if (!area || !list) return;

    if (parsedItems.length === 0) {
      area.style.display = "none";
      if (info) info.textContent = "Nenhuma transação encontrada.";
      return;
    }

    await loadImportCategories();
    area.style.display = "block";
    if (btnConf) btnConf.disabled = false;
    if (info)
      info.textContent = `${parsedItems.length} movimentos encontrados.`;

    // Apply guesses and filtering
    const finalItems = [];

    parsedItems.forEach((item) => {
      if (!item.category_id) {
        const guess = guessCategoryForLine(item.description, item.amount);
        if (guess.skip) return; // Skip item entirely

        item.category_id = guess.id;
        item.confidence = guess.confidence;
        if (guess.forceType) item.forceType = guess.forceType;
      }

      if (!item._normalized) {
        item.description = normalizeDescription(item.description);
        item._normalized = true;
      }

      // Ensure expense_nature is set (default) if category belongs to expense
      // This runs on first pass or if category changes.
      // But we only want to set it if undefined so we don't overwrite user choice?
      // Actually, if we change category, we probably should re-evaluate nature unless manual?
      // For now, let's just ensure it has a value for rendering.
      if (item.expense_nature === undefined) {
        const cObj = importCategories.find((c) => c.id === item.category_id);
        item.expense_nature = resolveExpenseNature(cObj, item.description);
      }

      finalItems.push(item);
    });

    // Update global parsedItems to only show valid ones
    parsedItems = finalItems;

    if (parsedItems.length === 0) {
      area.style.display = "none";
      if (info)
        info.textContent =
          "Nenhuma transação válida encontrada (itens ignorados removidos).";
      return;
    }

    if (info)
      info.textContent = `${parsedItems.length} movimentos encontrados.`;

    list.innerHTML = parsedItems
      .map((item, idx) => {
        const isLowConf = (item.confidence || 0) < 0.75;
        const borderStyle = isLowConf
          ? "border-left: 4px solid var(--orange-400);"
          : "border-left: 4px solid var(--green-500);";
        const badge = isLowConf
          ? `<span style="background:var(--orange-100); color:var(--orange-700); font-size:10px; padding:2px 6px; border-radius:4px; font-weight:bold">Rever</span>`
          : ``;

        // Check if categorized as Savings (Badge Blue)
        let catBadge = "";
        let isExpense = false;

        const catObj = importCategories.find((c) => c.id === item.category_id);
        if (catObj) {
          if (catObj.kind === "savings") {
            catBadge = `<span style="background:var(--blue-100); color:var(--blue-700); font-size:10px; padding:2px 6px; border-radius:4px; font-weight:bold; margin-left:4px">Poupança</span>`;
          } else if (catObj.kind === "expense") {
            isExpense = true;
          }
        }

        // OR fallback to amount < 0 if no category yet (though we force guess)
        if (!catObj && item.amount < 0) isExpense = true;

        // Nature Select (Fixed/Variable) - Only for expenses
        let natureHtml = "";
        if (isExpense) {
          const nat = item.expense_nature || "variable";
          natureHtml = `
              <select class="imp-nature" data-idx="${idx}" style="font-size:10px; padding:2px; border:1px solid #ddd; border-radius:4px; max-width:70px;">
                  <option value="variable" ${nat === "variable" ? "selected" : ""}>Var</option>
                  <option value="fixed" ${nat === "fixed" ? "selected" : ""}>Fixa</option>
              </select>
            `;
        }
        return `
            <div class="card" style="padding:10px; display:grid; gap:6px; background:${item.selected ? "#fff" : "#f0f0f0"}; ${borderStyle}">
               <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px">
                  <label style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:14px; margin:0">
                     <input type="checkbox" ${item.selected ? "checked" : ""} data-idx="${idx}" class="imp-cb">
                     ${item.date}
                     ${badge} ${catBadge}
                  </label>
                  <div style="display:flex; align-items:center; gap:6px">
                      ${natureHtml}
                      <input type="number" value="${item.amount.toFixed(2)}" class="imp-amt" data-idx="${idx}"
                             style="width:100px; text-align:right; padding:4px; font-weight:bold; color:${item.amount < 0 ? "var(--red-500)" : "var(--green-600)"}">
                  </div>
               </div>

               <div style="display:flex; gap:6px; align-items:center">
                 <input type="text" value="${escapeHtml(item.description)}" class="imp-desc" data-idx="${idx}"
                        style="font-size:13px; padding:6px; flex:1; border:1px solid #ddd; border-radius:4px">
                 <select class="imp-cat" data-idx="${idx}" style="width:140px; font-size:12px; padding:4px; border-radius:4px; border:1px solid #ddd; background: ${isLowConf ? "#fff7ed" : "#fff"}">
                    ${importCatOptions.replace(`value="${item.category_id}"`, `value="${item.category_id}" selected`)}
                 </select>
               </div>
            </div>`;
      })
      .join("");

    // Bind events
    list.querySelectorAll(".imp-cb").forEach(
      (el) =>
        (el.onchange = (e) => {
          const idx = e.target.dataset.idx;
          parsedItems[idx].selected = e.target.checked;
          e.target.closest(".card").style.background = e.target.checked
            ? "#fff"
            : "#f0f0f0";
        }),
    );
    list
      .querySelectorAll(".imp-desc")
      .forEach(
        (el) =>
          (el.oninput = (e) =>
            (parsedItems[e.target.dataset.idx].description = e.target.value)),
      );
    list
      .querySelectorAll(".imp-amt")
      .forEach(
        (el) =>
          (el.onchange = (e) =>
            (parsedItems[e.target.dataset.idx].amount = Number(
              e.target.value,
            ))),
      );
    list.querySelectorAll(".imp-cat").forEach(
      (el) =>
        (el.onchange = (e) => {
          const idx = e.target.dataset.idx;
          parsedItems[idx].category_id = Number(e.target.value);
          // Optional: Reset nature or re-resolve?
          // Ideally we just keep the user's manual choice if they made one, or let them set it.
          // But if they change category to an Ignore/Savings, does it matter?
          // Since we don't have a "re-guess nature" easily here without context, just update ID is fine.
        }),
    );
    list.querySelectorAll(".imp-cat").forEach(
      (el) =>
        (el.onchange = (e) => {
          parsedItems[e.target.dataset.idx].category_id =
            e.target.value || null;
          // Remove warning style on manual change
          e.target.style.background = "#fff";

          // Re-evaluate nature default when category changes (if user hasn't explicitly set it? Hard to track. Let's just update default)
          const catObj = importCategories.find((c) => c.id === e.target.value);
          const defNature = resolveExpenseNature(
            catObj,
            parsedItems[e.target.dataset.idx].description,
          );
          parsedItems[e.target.dataset.idx].expense_nature = defNature;

          // Must re-render to show/hide nature select or update value?
          // Ideally yes, but lazy way: just update underlying data.
          // If we want UI update, we have to re-render.
          renderReviewList();
        }),
    );
    list.querySelectorAll(".imp-nature").forEach(
      (el) =>
        (el.onchange = (e) => {
          parsedItems[e.target.dataset.idx].expense_nature = e.target.value;
        }),
    );
  }

  // Event Listeners

  // Feedback imediato no file selection
  $("#imp-file")?.addEventListener("change", () => {
    const fileInput = $("#imp-file");
    const info = $("#imp-info");
    const btnProcess = $("#imp-process");

    const f = fileInput.files?.[0];
    if (!f) {
      if (info) info.textContent = "";
      return;
    }

    const mb = (f.size / (1024 * 1024)).toFixed(1);
    let msg = `Selecionado: ${f.name} (${mb} MB)`;

    // Limite recomendado
    if (f.size > 12 * 1024 * 1024) {
      msg += " — ficheiro grande; pode falhar no telemóvel.";
      // Opcional: style warning
    }

    if (info) info.textContent = msg;
    if (btnProcess) btnProcess.disabled = false;
  });

  function setImpInfo(msg) {
    const el = $("#imp-info");
    if (el) el.textContent = msg;
  }

  $("#imp-process")?.addEventListener("click", async () => {
    const file = $("#imp-file")?.files?.[0];
    if (!file) return alert("Por favor, selecione um ficheiro primeiro.");

    const btn = $("#imp-process");
    // const info = $("#imp-info"); // Usar setImpInfo

    try {
      btn.disabled = true;
      btn.textContent = "A processar...";
      setImpInfo("A preparar ficheiro...");

      // Normalizar nome para detetar PDF
      const name = (file.name || "").trim().toLowerCase();
      const isPDF = file.type === "application/pdf" || name.endsWith(".pdf");

      if (isPDF) {
        setImpInfo("A ler PDF (pode demorar)...");
        // Pequeno delay para UI atualizar antes de bloquear main thread com parsing
        await new Promise((r) => setTimeout(r, 50));
        parsedItems = await parsePDF(file);
      } else {
        setImpInfo("A ler CSV...");
        parsedItems = await parseCSV(file);
      }

      await renderReviewList();

      // Se sucesso e items > 0, info é atualizado no renderReviewList.
      // Se 0 items, renderReviewList lida com isso (ou parsePDF já deu warning).
    } catch (err) {
      console.error(err);
      setImpInfo("Erro ao processar: " + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Processar Ficheiro";
      }
    }
  });

  $("#imp-clear")?.addEventListener("click", () => {
    parsedItems = [];
    $("#imp-file").value = "";
    $("#imp-review-area").style.display = "none";
    $("#imp-info").textContent = "";
  });

  $("#imp-confirm")?.addEventListener("click", async () => {
    try {
      const accountId = $("#imp-account")?.value;
      if (!accountId) return alert("Selecione a conta destino.");
      const uid = await getUserId();

      const toImport = parsedItems.filter((i) => i.selected);
      if (!toImport.length) return alert("Nenhuma transação selecionada.");

      const btn = $("#imp-confirm");
      btn.disabled = true;
      btn.textContent = "A guardar...";

      // Determine Type IDs (assuming standard IDs or map available)
      // If typeMap is not global, we might need to fetch it or use hardcoded common IDs if robust.
      // Usually `typeMap` is defined in settings.js scope or we fetch it.
      // Let's assume we can fetch or use existing logic.
      // If typeMap is missing, we fetch it now.
      let typeMapLocal = {};
      const { data: types } = await sb
        .from("transaction_types")
        .select("id,code");
      if (types) types.forEach((t) => (typeMapLocal[t.code] = t.id));

      const payload = toImport.map((item) => {
        const catObj = item.category_id ? catById.get(item.category_id) : null;
        const catKind = catObj?.kind || null;

        const isExpense = item.amount < 0;

        // Se veio de uma regra especial (ex: PoupeUp), isso manda.
        let typeCode =
          item.forceType ||
          (catKind === "savings"
            ? "SAVINGS"
            : catKind === "income"
              ? "INCOME"
              : catKind === "expense"
                ? "EXPENSE"
                : item.amount < 0
                  ? "EXPENSE"
                  : "INCOME");

        // Use the one from the item (wizard choice) or fallback to resolve
        const expNature =
          typeCode === "EXPENSE"
            ? item.expense_nature ||
              resolveExpenseNature(catObj, item.description)
            : null;

        return {
          user_id: uid,
          account_id: accountId,
          type_id: typeMapLocal[typeCode],
          amount: Math.abs(item.amount),
          date: item.date,
          description: item.description,
          category_id: item.category_id || null,
          currency: "EUR",
          expense_nature: expNature,
        };
      });

      const { error } = await sb.from("transactions").insert(payload);
      if (error) throw error;

      alert(`Sucesso! ${payload.length} movimentos importados.`);
      parsedItems = [];
      $("#imp-review-area").style.display = "none";
      $("#imp-file").value = "";
      $("#imp-info").textContent = "";
    } catch (e) {
      console.error(e);
      alert("Erro ao gravar: " + e.message);
    } finally {
      const btn = $("#imp-confirm");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Confirmar Importação";
      }
    }
  });

  // Init
  loadAccounts();

  document
    .querySelector("#imp-export-template")
    ?.addEventListener("click", () => exportImportTemplate());

  // ================== RELATÓRIOS ========================
  const overlay = $("#report-overlay");
  const closeBtn = $("#rpt-close");
  let _lastFocus = null;

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
    _rptSeries = null,
    _rptTopExp = null,
    _rptEffort = null,
    _rptSavRate = null,
    _rptReg = null;

  let _catLegendPDF = [],
    _fixLegendPDF = [],
    _monthlyPDF = [],
    _incomeCatPDF = [],
    _expenseCatPDF = [],
    _regularityAggPDF = [];

  function destroyCharts() {
    try {
      _rptCat?.destroy();
      _rptFix?.destroy();
      _rptSeries?.destroy();
      _rptTopExp?.destroy();
      _rptEffort?.destroy();
      _rptSavRate?.destroy();
      _rptReg?.destroy();
    } catch {}
    _rptCat =
      _rptFix =
      _rptSeries =
      _rptTopExp =
      _rptEffort =
      _rptSavRate =
      _rptReg =
        null;
    _catLegendPDF = [];
    _fixLegendPDF = [];
    _monthlyPDF = [];
    _incomeCatPDF = [];
    _expenseCatPDF = [];
    _regularityAggPDF = [];
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

  async function buildReport() {
    if (buildReport._busy) return;
    buildReport._busy = true;
    try {
      destroyCharts();
      fixCanvasHeights();
      $("#rpt-cat-legend") && ($("#rpt-cat-legend").innerHTML = "");
      $("#rpt-fv-legend") && ($("#rpt-fv-legend").innerHTML = "");

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
      let catMap = new Map(); // id -> {name, parent_id}

      try {
        // 1. Fetch categories for name resolution (Parent Name)
        const { data: allCats } = await sb
          .from("categories")
          .select("id,name,parent_id");
        if (allCats) {
          allCats.forEach((c) => catMap.set(c.id, c));
        }

        // 2. Fetch Transactions (With Pagination Loop)
        const selCols =
          "date,amount,signed_amount,type_id,expense_nature,regularity_id,category_id";

        let fetchedRows = [];
        let page = 0;
        const size = 1000;
        while (true) {
          const { data, error } = await sb
            .from("transactions")
            .select(selCols)
            .gte("date", from)
            .lt("date", to)
            .range(page * size, (page + 1) * size - 1)
            .order("date", { ascending: true });

          if (error) throw error;
          if (!data || !data.length) break;
          fetchedRows = fetchedRows.concat(data);
          if (data.length < size) break;
          page++;
        }
        rows = fetchedRows;
      } catch (e) {
        console.error(e);
        rows = [];
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

      // ===== 1) Despesas por categoria (pizza) =====
      await ensureChartStack();
      const byCatExp = new Map();
      expRows.forEach((x) => {
        const cat = x.category_id ? catMap.get(x.category_id) : null;
        const name = cat?.name || "Sem categoria";
        byCatExp.set(name, (byCatExp.get(name) || 0) + Number(x.amount || 0));
      });
      const catEntries = [...byCatExp.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12);
      const catLabels = catEntries.map(([k]) => k);
      const catValues = catEntries.map(([, v]) => v);
      const catTotal = catValues.reduce((a, b) => a + b, 0);

      _rptCat = makeChart($("#rpt-cat-pie"), {
        type: "pie",
        data: {
          labels: catLabels,
          datasets: [
            { data: catValues, backgroundColor: palette(catValues.length) },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true, // <- true
          aspectRatio: 1, // <- 1:1
          animation: false,
          plugins: {
            legend: { display: false },
            datalabels:
              catTotal > 0
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
        $("#rpt-cat-legend").innerHTML = legendHTML(_catLegendPDF);
      }

      // ===== 2) Fixas vs Variáveis (donut) =====
      const isFixed = (x) =>
        x.expense_nature === "fixed" ||
        (!x.expense_nature && x.category?.nature === "fixed");
      const fixedAmt = sum(expRows.filter(isFixed).map((x) => x.amount));
      const variableAmt = sum(
        expRows.filter((x) => !isFixed(x)).map((x) => x.amount),
      );
      const totFV = fixedAmt + variableAmt;

      _rptFix = makeChart($("#rpt-fixed-donut"), {
        type: "doughnut",
        data: {
          labels: ["Fixas", "Variáveis"],
          datasets: [
            {
              data: [fixedAmt, variableAmt],
              backgroundColor: ["#16a34a", "#ef4444"],
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true, // <- true
          aspectRatio: 1, // <- 1:1
          animation: false,
          plugins: {
            legend: { display: false },
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
          color: "#16a34a",
        },
        {
          label: "Variáveis",
          value: variableAmt,
          pct: totFV ? variableAmt / totFV : 0,
          color: "#ef4444",
        },
      ];
      if ($("#rpt-fv-legend")) {
        $("#rpt-fv-legend").innerHTML = legendHTML(_fixLegendPDF);
      }

      // ===== 3) Séries mensais + liquidez (cashflow acumulado) =====
      const months = {};
      (rows || []).forEach((r) => {
        const m = String(r.date).slice(0, 7);
        months[m] ||= { inc: 0, exp: 0, sav: 0, net: 0, fixed: 0 };
        if (r.type_id === tInc.id) {
          months[m].inc += +r.amount;
          months[m].net += +r.amount;
        }
        if (r.type_id === tExp.id) {
          months[m].exp += +r.amount;
          months[m].net -= +r.amount;
          if (isFixed(r)) months[m].fixed += +r.amount;
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

      // ===== 4) Tabelas: por categoria (Hierárquica Robust) =====
      const buildHierarchy = (txRows) => {
        const parents = new Map(); // Name -> Total

        for (const r of txRows) {
          const cid = r.category_id;
          const cat = catMap.get(cid);
          const val = Number(r.amount || 0);

          let pName = "Sem categoria";

          if (cat) {
            if (cat.parent_id) {
              const p = catMap.get(cat.parent_id);
              // Fallback: If parent missing, use Child Name.
              // If parent exists, use Parent Name (grouping by Parent).
              pName = p ? p.name : cat.name;
            } else {
              pName = cat.name;
            }
          }

          parents.set(pName, (parents.get(pName) || 0) + val);
        }

        return [...parents.entries()].sort((a, b) => b[1] - a[1]);
      };

      const incCat = buildHierarchy(incRows);
      const expCat = buildHierarchy(expRows);
      const incTot = incCat.reduce((a, [, v]) => a + v, 0);
      const expTot = expCat.reduce((a, [, v]) => a + v, 0);

      _incomeCatPDF = incCat.map(([label, value]) => ({ label, value }));
      _expenseCatPDF = expCat.map(([label, value]) => ({ label, value }));

      const renderTable = (el, cols, rows, footer = null) => {
        if (!el) return;
        const th = `<thead><tr>${cols
          .map((c) => `<th>${c.header}</th>`)
          .join("")}</tr></thead>`;
        const tb = `<tbody>${rows
          .map(
            (r) =>
              `<tr>${cols.map((c) => `<td>${c.cell(r)}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody>`;
        const tf = footer
          ? `<tfoot><tr>${cols
              .map((c, i) => `<td>${footer[i] || ""}</td>`)
              .join("")}</tr></tfoot>`
          : "";
        el.innerHTML = th + tb + tf;
      };

      renderTable(
        $("#tbl-income-cat"),
        [
          { header: "Categoria", cell: (r) => r[0] },
          { header: "Total", cell: (r) => money(r[1]) },
          { header: "%", cell: (r) => fmtPct(r[1] / (incTot || 1)) },
        ],
        incCat,
        ["Total", money(incTot), "100%"],
      );

      renderTable(
        $("#tbl-expense-cat"),
        [
          { header: "Categoria", cell: (r) => r[0] },
          { header: "Total", cell: (r) => money(r[1]) },
          { header: "%", cell: (r) => fmtPct(r[1] / (expTot || 1)) },
        ],
        expCat,
        ["Total", money(expTot), "100%"],
      );

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
        monthlyRows,
      );

      // ===== 5) Despesas por regularidade (agg) =====
      const regAgg = new Map(); // key: label; val: total
      expRows.forEach((r) => {
        const lab =
          REG_LABEL_BY_ID.get(r.regularity_id) ||
          (r.regularity_id ? String(r.regularity_id) : "Sem regularidade");
        regAgg.set(lab, (regAgg.get(lab) || 0) + Number(r.amount || 0));
      });
      const regSorted = [...regAgg.entries()].sort((a, b) => b[1] - a[1]);
      const regLabels = regSorted.map(([k]) => k);
      const regValues = regSorted.map(([, v]) => v);
      _regularityAggPDF = regSorted.map(([label, value]) => ({ label, value }));

      _rptReg = makeChart($("#rpt-regularity"), {
        type: "bar",
        data: {
          labels: regLabels,
          datasets: [
            {
              label: "Despesas por regularidade",
              data: regValues,
              backgroundColor: palette(regValues.length),
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
          scales: { y: { beginAtZero: true } },
        },
      });

      // ===== 6) Top 6 despesas (barras horizontais) =====
      const top6 = expCat.slice(0, 6);
      _rptTopExp = makeChart($("#rpt-top-exp"), {
        type: "bar",
        data: {
          labels: top6.map(([k]) => k),
          datasets: [
            {
              label: "Despesas",
              data: top6.map(([, v]) => v),
              backgroundColor: "#ef4444",
            },
          ],
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

      // ===== 7) Linhas: esforço e taxa de poupança =====
      // ===== 7) Linhas: esforço (Fixa vs Total) e taxa de poupança =====
      const effFixed = mlabels.map((m) => {
        const inc = months[m].inc || 0;
        const fix = months[m].fixed || 0;
        return inc ? (fix / inc) * 100 : 0;
      });
      const effTotal = mlabels.map((m) => {
        const inc = months[m].inc || 0;
        const ex = months[m].exp || 0;
        const sv = months[m].sav || 0;
        // Total effort = (Desired + Savings) / Income ? No, user said: (Expense + Savings) / Income
        // "effort_total = (expense + savings) / income * 100"
        return inc ? ((ex + sv) / inc) * 100 : 0;
      });

      const savRate = mlabels.map((m) => {
        const inc = months[m].inc || 0;
        const sv = months[m].sav || 0;
        return inc ? (sv / inc) * 100 : 0;
      });

      _rptEffort = makeChart($("#rpt-effort"), {
        type: "line",
        data: {
          labels: mlabels,
          datasets: [
            {
              label: "Esforço Fixo",
              data: effFixed,
              borderColor: "#16a34a", // Green
              backgroundColor: "#16a34a",
              borderWidth: 2,
              tension: 0.25,
            },
            {
              label: "Esforço Total",
              data: effTotal,
              borderColor: "#ea580c", // Orange
              backgroundColor: "#ea580c",
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
            legend: { position: "top" },
            tooltip: {
              callbacks: {
                label: (c) => `${c.dataset.label}: ${c.formattedValue}%`,
              },
            },
            datalabels: { display: false },
          },
          scales: { y: { beginAtZero: true } },
        },
      });
      _rptSavRate = makeChart($("#rpt-savings-rate"), {
        type: "line",
        data: {
          labels: mlabels,
          datasets: [
            {
              label: "Poupança %",
              data: savRate,
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
            legend: { position: "top" },
            datalabels: { display: false },
          },
          scales: { y: { beginAtZero: true } },
        },
      });

      // ===== 8) Insights / Alertas =====
      // ===== 8) Insights / Alertas =====
      const effortFixedRate = income ? (fixedAmt / income) * 100 : 0;
      const effortTotalRate = income ? ((expense + savings) / income) * 100 : 0;
      const savRateTot = income ? (savings / income) * 100 : 0;
      const negMonths = monthlyRows.filter((r) => r.net < 0).length;
      const lastLiq = monthlyRows.at(-1)?.liq || 0;
      const insights = [];

      insights.push(
        `Esforço Fixo: <strong>${effortFixedRate.toFixed(1)}%</strong>` +
          (effortFixedRate > 50
            ? " <span style='color:#b91c1c'>(crítico)</span>"
            : effortFixedRate > 35
              ? " <span style='color:#f59e0b'>(atenção)</span>"
              : " <span style='color:#15803d'>(saudável)</span>"),
      );
      insights.push(
        `Esforço Total: <strong>${effortTotalRate.toFixed(1)}%</strong> (incl. poupança)`,
      );
      insights.push(
        `Taxa de poupança: <strong>${savRateTot.toFixed(
          1,
        )}%</strong> das receitas.`,
      );
      if (negMonths > 0)
        insights.push(
          `Alerta: <strong>${negMonths}</strong> mes(es) com saldo mensal negativo.`,
        );
      insights.push(
        `Liquidez no fim do período: <strong>${money(lastLiq)}</strong>.`,
      );

      $("#rpt-insights") &&
        ($("#rpt-insights").innerHTML = insights
          .map((x) => `<li>${x}</li>`)
          .join(""));
    } finally {
      buildReport._busy = false;
    }

    // resize final
    setTimeout(() => {
      try {
        _rptCat?.resize();
        _rptFix?.resize();
        _rptSeries?.resize();
        _rptTopExp?.resize();
        _rptEffort?.resize();
        _rptSavRate?.resize();
        _rptReg?.resize();
      } catch {}
    }, 0);
  }

  // =================== Exportação PDF ===================
  $("#rpt-export")?.addEventListener("click", async () => {
    try {
      if (!buildReport._busy) await buildReport();
    } catch {}
    const jsPDF = await getJsPDF();
    if (!jsPDF) return alert("Falhou a carregar o gerador de PDF.");

    const REPORT_CFG = {
      title: ($("#rpt-title")?.textContent || "Relatório Financeiro").trim(),
      author: "Relatório WiseBudget",
      subject: "",
      creator: "WiseBudget®",
      filename: "wisebudget-relatorio.pdf",
      brandColor: "#065f46",
      headerGap: 12, // <- um pouco menor (vamos compensar no 'y')
      logoSize: { w: 54, h: 54 }, // <- tamanho do logo no PDF
      titleOffsetY: 12, // <- afinação vertical do título
      logoOffsetY: -30, // <- sobe ligeiramente o logo
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

    // tenta obter logo do modal
    let logoDataUrl = null;
    try {
      const logoEl = document.getElementById("app-logo-img");
      if (logoEl?.src) {
        logoDataUrl = await toDataURL(logoEl.src);
      } else {
        logoDataUrl = await toDataURL("/wisebudget_bk_wt.png");
      }
    } catch {
      /* sem logo, segue */
    }

    const line = (x1, y1, x2, y2) => {
      doc.setDrawColor(230);
      doc.line(x1, y1, x2, y2);
    };
    const header = (title, subtitle = null) => {
      // linha base para o bloco do cabeçalho
      const baseY = y;

      if (logoDataUrl) {
        doc.addImage(
          logoDataUrl,
          "PNG",
          M,
          baseY + (REPORT_CFG.logoOffsetY || 0),
          REPORT_CFG.logoSize.w,
          REPORT_CFG.logoSize.h,
          undefined,
          "FAST",
        );
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        // título alinhado verticalmente ao centro do logo
        const titleY = baseY + (REPORT_CFG.titleOffsetY ?? 12);
        doc.text(title, M + REPORT_CFG.logoSize.w + 5, titleY);
      } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(title, M, baseY);
      }

      if (subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(subtitle, W - M, baseY, { align: "right" });
      }

      // linha separadora + empurra mais o cursor antes dos KPIs
      const lineY = baseY + REPORT_CFG.headerGap;
      doc.setDrawColor(230);
      doc.line(M, lineY, W - M, lineY);

      y = lineY + 28; // <- espaço extra antes das caixas KPI
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

    // Cabeçalho
    header(REPORT_CFG.title, new Date().toLocaleString("pt-PT"));

    // KPIs (4 colunas)
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

    // helper: desenhar canvas
    // helper: desenhar canvas
    const canvasToPage = (sel, x, y2, w, fixedH) => {
      const c = document.querySelector(sel);
      if (!c) return y2;
      // Auto-height baseada no aspect ratio para evitar distorção
      const ratio = c.height / c.width;
      const h = fixedH || w * ratio;

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
          { maxWidth: maxW - 14 },
        );
        y2 += lh;
      }
      return y2;
    };

    // === LINHA 1: Pizza (Categoria) + Donut (Fixas) LADO A LADO ===
    ensureSpace(240);
    const row1Y = y;
    const halfW = (W - 2 * M - 20) / 2;

    // Coluna Esq: Categorias
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Despesas por categoria", M, row1Y);
    let yL = row1Y + 14;
    yL = canvasToPage("#rpt-cat-pie", M, yL, halfW); // Auto-ratio
    yL += 8;
    yL = drawLegend(window._catLegendPDF || _catLegendPDF, M, yL, halfW);

    // Coluna Dir: Fixas vs Variáveis
    const xR = M + halfW + 20;
    doc.text("Fixas vs Variáveis", xR, row1Y);
    let yR = row1Y + 14;
    yR = canvasToPage("#rpt-fixed-donut", xR, yR, halfW); // Auto-ratio
    yR += 8;
    yR = drawLegend(window._fixLegendPDF || _fixLegendPDF, xR, yR, halfW);

    // Sincroniza Y pelo maior
    y = Math.max(yL, yR) + 24;

    // === LINHA 2: Evolução Mensal ===
    ensureSpace(220);
    doc.text("Evolução mensal", M, y);
    y += 12;
    y = canvasToPage("#rpt-series", M, y, W - 2 * M) + 24;

    // === LINHA 3: Top 6 (para quebrar página se precisar) ===
    ensureSpace(220);
    doc.text("Top 6 categorias de despesa", M, y);
    y += 12;
    y = canvasToPage("#rpt-top-exp", M, y, W - 2 * M) + 24;

    // === LINHA 4: Regularidade ===
    ensureSpace(220);
    doc.text("Despesas por regularidade", M, y);
    y += 12;
    y = canvasToPage("#rpt-regularity", M, y, W - 2 * M) + 24;

    // === LINHA 5: Taxa de esforço (Fixed vs Total) ===
    ensureSpace(220);
    doc.text("Taxa de esforço mensal (Fixa vs Total)", M, y);
    y += 12;
    y = canvasToPage("#rpt-effort", M, y, W - 2 * M) + 24;

    // Página 2: Tabelas (Categorias + Resumo + Regularidade)
    footer();
    doc.addPage();
    y = M;
    header(
      "Detalhe — Categorias & Resumo",
      new Date().toLocaleDateString("pt-PT"),
    );

    // tabela util (c/ cabeçalho colorido)
    function tablePDF(title, cols, rows, widths) {
      // cada linha “ocupa” ~14pt + 6 de respiro por bloco
      const TH = 18,
        ROWH = 14,
        GAP = 6;

      // força quebra se faltar espaço para cabeçalho + 4 linhas
      ensureSpace(TH + 4 * ROWH + 24);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, M, y);
      y += 8;

      // cabeçalho colorido
      doc.setFillColor(REPORT_CFG.brandColor);
      doc.setTextColor("#ffffff");
      let x = M;
      cols.forEach((h, i) => {
        doc.rect(x, y, widths[i], TH, "F");
        doc.text(h, x + 6, y + 12);
        x += widths[i];
      });
      y += TH + 6;

      // corpo (quebra automática por página)
      doc.setTextColor("#000000");
      doc.setFont("helvetica", "normal");
      for (const r of rows) {
        ensureSpace(ROWH);
        let xi = M;
        r.forEach((cell, i) => {
          const align = i === 0 ? "left" : "right";
          doc.text(
            String(cell),
            xi + (align === "right" ? widths[i] - 2 : 0),
            y,
            {
              align,
            },
          );
          xi += widths[i];
        });
        y += ROWH;
      }
      y += GAP;
    }

    // categorias receitas
    tablePDF(
      "Receitas por categoria",
      ["Categoria", "Total", "%"],
      (_incomeCatPDF || []).map((r) => [
        r.label,
        money(r.value),
        fmtPct(
          r.value /
            ((_incomeCatPDF || []).reduce((a, x) => a + x.value, 0) || 1),
        ),
      ]),
      [W * 0.45, W * 0.25, W * 0.15].map((w) => w * (1 - (2 * M) / W)),
    );

    // categorias despesas
    tablePDF(
      "Despesas por categoria",
      ["Categoria", "Total", "%"],
      (_expenseCatPDF || []).map((r) => [
        r.label,
        money(r.value),
        fmtPct(
          r.value /
            ((_expenseCatPDF || []).reduce((a, x) => a + x.value, 0) || 1),
        ),
      ]),
      [W * 0.45, W * 0.25, W * 0.15].map((w) => w * (1 - (2 * M) / W)),
    );

    // resumo mensal
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
      [80, 80, 80, 80, 80, 90],
    );

    // regularidade (somatório)
    tablePDF(
      "Despesas por regularidade",
      ["Regularidade", "Total"],
      (_regularityAggPDF || []).map((r) => [r.label, money(r.value)]),
      [W * 0.55, W * 0.25].map((w) => w * (1 - (2 * M) / W)),
    );

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
  $("#btn-change-pass")?.addEventListener("click", async () => {
    const next = $("#set-new-pass")?.value || "";
    const conf = $("#set-new-pass-2")?.value || "";

    if (!next || next.length < 8)
      return alert("A nova palavra-passe deve ter pelo menos 8 caracteres.");
    if (next !== conf) return alert("As novas palavras-passe não coincidem.");

    try {
      const { error } = await sb.auth.updateUser({ password: next });
      if (error) throw error;

      if ($("#set-new-pass")) $("#set-new-pass").value = "";
      if ($("#set-new-pass-2")) $("#set-new-pass-2").value = "";
      alert("Alteração feita com sucesso.");
    } catch (e) {
      alert(e?.message || "Não foi possível alterar a palavra-passe.");
    }
  });

  // ===== GESTÃO DE DADOS (Delete) =====
  $("#btn-del-month")?.addEventListener("click", async () => {
    const val = $("#del-month")?.value;
    if (!val) return alert("Por favor, selecione um mês.");

    if (
      !confirm(
        `ATENÇÃO: Isto irá apagar TODOS os movimentos de ${val}. Esta ação não pode ser desfeita. Continuar?`,
      )
    )
      return;
    if (
      !confirm(
        `Tem a certeza ABSOLUTA? Os dados de ${val} serão perdidos para sempre.`,
      )
    )
      return;

    try {
      const [y, m] = val.split("-");
      // Calculate first and last day of month
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0); // Last day of previous month (which is current month in loop logic? No: year, month, 0 is last day of month-1. Wait. new Date(2023, 1, 0) is Jan 31? No.
      // JS Date: Month is 0-indexed.
      // input type="month" value="2024-01". y=2024, m=01.
      // start = new Date(2024, 0, 1) -> Jan 1
      // end = new Date(2024, 1, 0) -> Feb 0 -> Jan 31. Correct.
      // But let's be robust:
      // Helper YMD:
      const yStr = start.getFullYear();
      const mStr = String(start.getMonth() + 1).padStart(2, "0");
      const lastDay = new Date(y, m, 0).getDate();

      const fromISO = `${yStr}-${mStr}-01`;
      const toISO = `${yStr}-${mStr}-${lastDay}`;

      await repo.transactions.deleteByRange(fromISO, toISO);
      alert("Movimentos eliminados com sucesso.");
      $("#del-month").value = "";
    } catch (e) {
      alert("Erro ao eliminar: " + (e.message || e));
    }
  });

  // ===== LOGO no modal: tamanho via CSS ou JS opcional =====
  // (mantemos simples; se precisares de ajustar dinamicamente, usa CSS .rep-logo)
  // ... resto do init de settings (importação CSV, relatórios, etc.)
  renderMiniShelf(outlet);

  // ========= ORÇAMENTO DE ESTADO =========
  const budOverlay = $("#budget-overlay");
  const budClose = $("#bud-close");
  const budTargetYear = $("#bud-target-year");
  const budOpenBtn = $("#btn-budget-open");

  if (budTargetYear) budTargetYear.value = new Date().getFullYear() + 1;

  async function calculateBudget() {
    const targetY = Number(
      budTargetYear?.value || new Date().getFullYear() + 1,
    );
    const baseY = targetY - 1;
    const titleEl = $("#bud-title");
    if (titleEl) titleEl.textContent = `Orçamento de Estado ${targetY}`;

    let expenses = [];
    try {
      expenses = await repo.transactions.getFixedExpensesByYear(baseY);
    } catch (e) {
      alert("Erro a carregar despesas: " + e.message);
      return;
    }

    // Group by category
    const cats = new Map();
    let baseTotal = 0;

    for (const t of expenses) {
      const cid = t.category_id || "uncat";
      const cname = t.categories?.name || "(Sem Categoria)";
      const val = Number(t.amount || 0);

      if (!cats.has(cid))
        cats.set(cid, {
          id: cid,
          name: cname,
          base: 0,
          prop: 0,
          locked: false,
        });
      const c = cats.get(cid);
      c.base += val;
      baseTotal += val;
    }

    // Initial Proposed = Base
    for (const c of cats.values()) {
      c.prop = c.base;
    }

    // Sort logic handled in render but convenient to have list
    const rows = Array.from(cats.values());

    renderBudgetTable(rows, baseTotal);
    budOverlay?.classList.remove("hidden");
  }

  function renderBudgetTable(rows, baseTotal) {
    const tbody = $("#bud-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    rows
      .sort((a, b) => b.base - a.base)
      .forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="padding:8px">${r.name}</td>
            <td style="padding:8px;text-align:right">${money(r.base)}</td>
            <td style="padding:8px;text-align:right">
                <input type="number" step="0.01" value="${r.prop.toFixed(2)}" 
                       style="width:100px;text-align:right;border:1px solid #ccc;border-radius:4px"
                       ${r.locked ? "disabled" : ""}
                       data-cid="${r.id}">
            </td>
            <td style="padding:8px;text-align:center">
                <input type="checkbox" ${
                  r.locked ? "checked" : ""
                } data-lock="${r.id}">
            </td>
        `;

        const input = tr.querySelector("input[type=number]");
        const lock = tr.querySelector("input[type=checkbox]");

        input.addEventListener("change", (e) => {
          r.prop = Number(e.target.value);
          updateBudgetSummary(rows, baseTotal);
        });

        lock.addEventListener("change", (e) => {
          r.locked = e.target.checked;
          input.disabled = r.locked;
        });

        tbody.appendChild(tr);
      });

    updateBudgetSummary(rows, baseTotal);
  }

  function updateBudgetSummary(rows, baseTotal) {
    const propTotal = rows.reduce((s, r) => s + r.prop, 0);
    const diff = propTotal - baseTotal;
    const diffPct = baseTotal ? (diff / baseTotal) * 100 : 0;
    const color = diff > 0 ? "#ef4444" : "#22c55e";

    const summary = $("#bud-summary");
    if (summary) {
      summary.innerHTML = `
        <div class="rpt-kpi"><div>Ano Base (${
          $("#bud-target-year").value - 1
        })</div><strong>${money(baseTotal)}</strong></div>
        <div class="rpt-kpi"><div>Orçamento (${
          $("#bud-target-year").value
        })</div><strong>${money(propTotal)}</strong></div>
        <div class="rpt-kpi"><div>Variação</div><strong style="color:${color}">${
          diff >= 0 ? "+" : ""
        }${diffPct.toFixed(1)}% (${money(diff)})</strong></div>
      `;
    }

    const saveBtn = $("#bud-save");
    if (saveBtn) {
      saveBtn.onclick = async () => {
        if (
          !confirm(
            "Isto irá criar/atualizar objetivos (tetos mensais) para estas categorias. Continuar?",
          )
        )
          return;
        try {
          const uid = await getUserId();

          // Calcular totais globais
          const totalProp = rows.reduce(
            (acc, r) => acc + (r.id === "uncat" ? 0 : Number(r.prop) || 0),
            0,
          );
          const monthlyProp = totalProp / 12;

          // 1. Orçamento Mensal (Usando budget_cap + monthly_cap)
          const { data: existingM } = await sb
            .from("objectives")
            .select("id")
            .eq("type", "budget_cap")
            .eq("title", "Orçamento Mensal (Global)")
            .maybeSingle();

          const payloadM = {
            user_id: uid,
            title: "Orçamento Mensal (Global)",
            type: "budget_cap",
            category_id: null,
            monthly_cap: monthlyProp,
            target_amount: null,
            is_active: true,
          };
          if (existingM) {
            await sb.from("objectives").update(payloadM).eq("id", existingM.id);
          } else {
            await sb.from("objectives").insert(payloadM);
          }

          // 2. Orçamento Anual (Usando budget_cap + target_amount para diferenciar)
          const { data: existingY } = await sb
            .from("objectives")
            .select("id")
            .eq("type", "budget_cap")
            .eq("title", "Orçamento Anual (Global)")
            .maybeSingle();

          const payloadY = {
            user_id: uid,
            title: "Orçamento Anual (Global)",
            type: "budget_cap",
            category_id: null,
            monthly_cap: null,
            target_amount: totalProp,
            is_active: true,
          };
          if (existingY) {
            await sb.from("objectives").update(payloadY).eq("id", existingY.id);
          } else {
            await sb.from("objectives").insert(payloadY);
          }

          alert("Orçamento Global guardado com sucesso!");
          budOverlay?.classList.add("hidden");
        } catch (e) {
          alert("Erro ao guardar: " + e.message);
        }
      };
    }
  }

  budOpenBtn?.addEventListener("click", calculateBudget);
  budClose?.addEventListener("click", () =>
    budOverlay?.classList.add("hidden"),
  );
  $("#bud-cancel")?.addEventListener("click", () =>
    budOverlay?.classList.add("hidden"),
  );
  /* ===== THEME SETTINGS (Strict Global System) == */
  const themeOverlay = $("#theme-overlay");
  const btnThemeOpen = $("#btn-theme-open");
  const btnThemeClose = $("#theme-close");
  const btnThemeSave = $("#thm-save");
  const btnThemeReset = $("#thm-reset");

  // Mapeamento inputs -> keys do user_settings
  const inputs = {
    // Fundo
    bgFile: $("#thm-bg-file"), // File Input
    bgUrl: $("#thm-bg-url"), // Hidden URL
    bgClear: $("#thm-bg-clear"), // Clear btn
    bgStatus: $("#thm-bg-status"), // Status Label

    bgColor: $("#thm-bg"),
    bgBlur: $("#thm-overlay-blur"),

    // Overlay
    overlayCol: $("#thm-overlay-col"),
    overlayOp: $("#thm-overlay-op"),

    // Cartões
    cardBgColor: $("#thm-card"),
    cardOp: $("#thm-opacity"),
    cardBgText: $("#thm-card-bg-text"),
    cardBlur: $("#thm-blur"),

    // Header & Footer
    headerBg: $("#thm-header"),
    fabBg: $("#thm-fab"),

    // Typography
    textMain: $("#thm-text"),
    textSec: $("#thm-muted"),
  };

  const { DEFAULT_THEME, applyTheme } = await import("../lib/theme.js");

  // ... (hexAlphaToRgba helper remains)

  // Upload Logic
  async function uploadBackgroundImage(file) {
    if (!file) return null;
    try {
      if (inputs.bgStatus) inputs.bgStatus.textContent = "A carregar...";
      const uid = (await sb.auth.getUser()).data.user.id;
      const ext = file.name.split(".").pop();
      const path = `bg/${uid}/${Date.now()}.${ext}`;

      const { data, error } = await sb.storage
        .from("user-assets")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = sb.storage.from("user-assets").getPublicUrl(path);

      if (inputs.bgStatus) inputs.bgStatus.textContent = "Carregado!";
      return publicUrl;
    } catch (err) {
      console.error("Upload error:", err);
      if (inputs.bgStatus) inputs.bgStatus.textContent = "Erro no upload.";
      alert(
        "Erro ao carregar imagem (Verifique se o bucket 'user-assets' existe e é público).",
      );
      return null;
    }
  }

  // Event Listener for File Input
  inputs.bgFile?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadBackgroundImage(file);
    if (url) {
      if (inputs.bgUrl) inputs.bgUrl.value = url;
      // Trigger live preview
      const s = getSettingsFromInputs();
      applyTheme(s);
    }
  });

  // Listener for manual URL paste
  inputs.bgUrl?.addEventListener("input", () => {
    const s = getSettingsFromInputs();
    applyTheme(s);
  });

  inputs.bgClear?.addEventListener("click", () => {
    if (inputs.bgUrl) inputs.bgUrl.value = "";
    if (inputs.bgFile) inputs.bgFile.value = ""; // clear file input
    if (inputs.bgStatus) inputs.bgStatus.textContent = "Imagem removida.";
    // Trigger live preview
    const s = getSettingsFromInputs();
    applyTheme(s);
  });

  // ... (rest of logic)
  function hexAlphaToRgba(hex, alpha) {
    let r = 0,
      g = 0,
      b = 0;
    if (hex && hex.length === 7) {
      r = parseInt(hex.substring(1, 3), 16);
      g = parseInt(hex.substring(3, 5), 16);
      b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Load params into inputs
  function loadThemeToInputs() {
    try {
      const visuals = JSON.parse(localStorage.getItem("wb:visuals") || "{}");
      const s = { ...DEFAULT_THEME, ...visuals };

      // Fundo
      if (inputs.bgUrl) inputs.bgUrl.value = s.bg_image_url || "";
      if (inputs.bgColor) inputs.bgColor.value = s.bg_color || "#0b1220";
      if (inputs.bgBlur) {
        inputs.bgBlur.value = s.bg_blur_px || 0;
        $("#thm-overlay-blur-val") &&
          ($("#thm-overlay-blur-val").textContent = s.bg_blur_px + "px");
      }

      // Overlay
      if (inputs.overlayCol)
        inputs.overlayCol.value = s.overlay_color || "#000000"; // Simplificação (assumindo hex ou aceitando string)

      // Card
      if (inputs.cardBgText) inputs.cardBgText.value = s.card_bg_rgba;
      if (inputs.cardBlur) {
        inputs.cardBlur.value = s.card_blur_px || 0;
        $("#thm-blur-val") &&
          ($("#thm-blur-val").textContent = s.card_blur_px + "px");
      }

      // Header / Fab
      // Note: we store RGBA in DB but inputs are Color Pickers (Euro-centric UI often wants simple hex).
      // We will assume the user picks a solid color for the base variable or we try to extract hex.
      // For strict correctness, we should store hex in DB if we want 1:1 input mapping, but DB says RGBA.
      // We'll set the input to the fallback hex or try to parse.
      // Simplified: Just set the color if valid hex, else default.

      // Typography
      if (inputs.textMain) inputs.textMain.value = s.text_main || "#0f172a";
      if (inputs.textSec) inputs.textSec.value = s.text_secondary || "#64748b";
    } catch (e) {
      console.warn("Theme load to GUI error", e);
    }
  }

  function getSettingsFromInputs() {
    // 1. Fundo
    const bg_image_url = inputs.bgUrl?.value?.trim() || "";
    const bg_color = inputs.bgColor?.value || "#0b1220";
    const bg_blur_px = Number(inputs.bgBlur?.value || 0);

    // 2. Overlay
    // 2. Overlay
    // Bugfix: Combine Color Picker (Hex) + Opacity Slider -> RGBA
    const ovHex = inputs.overlayCol?.value || "#000000";
    const ovOp = inputs.overlayOp?.value || "0.35";
    const overlay_color = hexAlphaToRgba(ovHex, ovOp);

    // 3. Card logic
    // We combine the picker (Hex) + opacity slider -> RGBA
    let card_bg_rgba = inputs.cardBgText?.value;
    // If empty likely waiting for recalc

    // 4. Structure
    // Header & Menu share the same color base usually, with slight opacity diffs?
    // User asked "Cor/transparência do header, menu".
    // We will use the Header Picker and generate RGBA for both header/menu for consistency.
    const hHex = inputs.headerBg?.value || "#0f172a";
    const header_bg_rgba = hexAlphaToRgba(hHex, "0.95");
    const menu_bg_rgba = hexAlphaToRgba(hHex, "0.98");

    const fab_bg = inputs.fabBg?.value || "#0ea5e9";

    const card_blur_px = Number(inputs.cardBlur?.value || 0);
    const card_border_rgba = "rgba(255,255,255,0.12)"; // Fixed default

    return {
      bg_image_url,
      bg_color,
      bg_blur_px,
      overlay_color,
      card_bg_rgba,
      card_border_rgba,
      card_blur_px,
      header_bg_rgba,
      menu_bg_rgba,
      fab_bg,
      text_main: inputs.textMain?.value || "#0f172a",
      text_secondary: inputs.textSec?.value || "#64748b",
    };
  }

  // Live Preview & Input Logic
  Object.values(inputs).forEach((el) => {
    el?.addEventListener("input", (e) => {
      // Sync Opacity Slider for Cards
      if (e.target === inputs.cardBgColor || e.target === inputs.cardOp) {
        const hex = inputs.cardBgColor?.value || "#ffffff";
        const op = inputs.cardOp?.value || "0.92";
        if (inputs.cardBgText)
          inputs.cardBgText.value = hexAlphaToRgba(hex, op);
        const span = document.getElementById("thm-opacity-val");
        if (span) span.textContent = op;
      }

      // Updates labels
      if (e.target === inputs.overlayOp && $("#thm-overlay-op-val"))
        $("#thm-overlay-op-val").textContent = e.target.value;

      if (e.target === inputs.bgBlur && $("#thm-overlay-blur-val"))
        $("#thm-overlay-blur-val").textContent = e.target.value + "px";

      if (e.target === inputs.cardBlur && $("#thm-blur-val"))
        $("#thm-blur-val").textContent = e.target.value + "px";

      // Apply Live
      const s = getSettingsFromInputs();
      // Ensure card_bg_rgba is set if we didn't touch the sliders yet
      if (!s.card_bg_rgba && inputs.cardBgText)
        s.card_bg_rgba = inputs.cardBgText.value;

      applyTheme(s);
    });
  });

  btnThemeOpen?.addEventListener("click", () => {
    themeOverlay?.classList.remove("hidden");
    themeOverlay?.removeAttribute("aria-hidden");
    loadThemeToInputs();
  });

  function closeThemeModal() {
    themeOverlay?.classList.add("hidden");
    themeOverlay?.setAttribute("aria-hidden", "true");
    const s = getSettingsFromInputs();
    if (!s.card_bg_rgba && inputs.cardBgText)
      s.card_bg_rgba = inputs.cardBgText.value;

    // Save to DB
    saveGlobalTheme(sb, s).catch(console.error);
  }

  btnThemeClose?.addEventListener("click", closeThemeModal);
  btnThemeSave?.addEventListener("click", closeThemeModal);

  btnThemeReset?.addEventListener("click", () => {
    if (!confirm("Restaurar as cores padrão?")) return;
    applyTheme(DEFAULT_THEME);
    localStorage.removeItem("wb:visuals");
    saveGlobalTheme(sb, DEFAULT_THEME).catch(console.error);
    closeThemeModal();
  });

  // Init load global theme (ensure visual consistency on navigate)
  const visuals = JSON.parse(localStorage.getItem("wb:visuals") || "null");
  if (visuals) applyTheme(visuals);
} // end init
