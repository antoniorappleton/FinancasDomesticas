// Shared utility functions for Wisebudget PWA

export const pad2 = (n) => String(n).padStart(2, "0");

export const ymd = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const money = (n) =>
  "€ " +
  Number(n || 0).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

export const normalizeHeader = (h) =>
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

export const splitCSVLine = (line, d) =>
  line
    .split(new RegExp(`${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`))
    .map((s) => s.replace(/^"(.*)"$/, "$1").replace(/""/g, '"'));

export const detectDelimiter = (text) => {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const cand = [",", ";", "\t", "|"];
  const scores = cand.map(
    (d) =>
      (sample.match(new RegExp(`\\${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`, "g")) || [])
        .length
  );
  return cand[scores.indexOf(Math.max(...scores))] || ",";
};

export const normalizeMoney = (s) => {
  if (typeof s === "number") return +s.toFixed(2);
  if (!s) return 0;
  const n = String(s)
    .replace(/[€\s]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const v = parseFloat(n);
  return isNaN(v) ? 0 : +v.toFixed(2);
};

export const parseAmount = (s) =>
  Number(String(s || "").replace(",", ".")) || 0;

export const mapKind = (tipo) => {
  const t = String(tipo || "").toLowerCase();
  if (t.includes("receit")) return "income";
  if (t.includes("poup")) return "savings";
  return "expense";
};

export const mapNature = (tipo) =>
  String(tipo || "")
    .toLowerCase()
    .startsWith("fix")
    ? "fixed"
    : "variable";

// Async script loading with better error handling
export async function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

// Chart.js and plugins loading
let chartStackLoaded = false;
export async function ensureChartStack() {
  if (chartStackLoaded) return;

  try {
    if (!window.Chart) {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
      );
    }
    if (!window.ChartDataLabels) {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js"
      );
    }
    // Register plugin if both are loaded
    // Register plugin if both are loaded
    if (window.Chart && window.ChartDataLabels) {
      window.Chart.register(window.ChartDataLabels);
      // Disable globally (user asked to remove values from points)
      if (window.Chart.defaults.plugins) {
         window.Chart.defaults.plugins.datalabels = { display: false };
      }
    }
    chartStackLoaded = true;
  } catch (error) {
    throw new Error(`Failed to load Chart.js stack: ${error.message}`);
  }
}

// jsPDF loading with fallbacks
export async function getJsPDF() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;

  try {
    const mod = await import(
      "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.es.min.js"
    );
    return mod.jsPDF || window.jspdf?.jsPDF;
  } catch {
    try {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
      );
      return window.jspdf?.jsPDF;
    } catch (error) {
      throw new Error(`Failed to load jsPDF: ${error.message}`);
    }
  }
}

// Image to dataURL utility
export async function toDataURL(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Image not found");
  const blob = await res.blob();
  return await new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}

// Color palette for charts — gerada a partir da cor de destaque (vários tons/
// transparências da mesma cor), não de um arco-íris de tons soltos. Mantém o
// gráfico legível com várias categorias sem introduzir novas cores à app.
const PALETTE_FALLBACK_ACCENT = "#216354";
const PALETTE_GRAYS = ["#9a9a96", "#b8b8b4", "#d4d4d0"];

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(rgb) {
  return (
    "#" +
    rgb
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function mixHex(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(a.map((c, i) => c + (b[i] - c) * t));
}

function currentAccent() {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--ui-fab-bg")
      .trim();
    return v || PALETTE_FALLBACK_ACCENT;
  } catch {
    return PALETTE_FALLBACK_ACCENT;
  }
}

export function palette(n, accent = currentAccent()) {
  const steps = Math.min(n, 7);
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0.5 : i / (steps - 1); // 0 (escuro) .. 1 (claro)
    out.push(
      t < 0.5
        ? mixHex("#000000", accent, t / 0.5)
        : mixHex(accent, "#ffffff", (t - 0.5) / 0.5),
    );
  }
  for (let i = steps; i < n; i++) out.push(PALETTE_GRAYS[(i - steps) % PALETTE_GRAYS.length]);
  return out;
}

// Legend HTML generator
export function legendHTML(items) {
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
              1
            )}%)</span>`
          : ""
      }
    </div>`
    )
    .join("");
}

// Moving average helper
export const movingAverage = (arr, windowSize = 6) => {
  const n = Math.min(windowSize, arr.length);
  if (!n) return 0;
  let s = 0;
  for (let i = arr.length - n; i < arr.length; i++) s += Number(arr[i] || 0);
  return s / n;
};

// Date helper: Generate month keys (YYYY-MM) between two ISO dates
export const monthKeysBetween = (fromISO, toISO) => {
  const out = [];
  let [y, m] = fromISO.split("-").map(Number);
  const [y2, m2] = toISO.split("-").map(Number);
  
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m === 13) {
      m = 1;
      y++;
    }
  }
  return out;
};

// Shared chart colors — neutros (3 tons, por peso) + 1 cor de destaque só para o
// saldo/linha de topo. Sem verde/vermelho/azul: receita vs. despesa distingue-se
// pela posição/rótulo no gráfico, não pela cor.
export const CHART_COLORS = {
  inc: "rgba(24,24,27,0.80)", // neutro escuro
  exp: "rgba(107,114,128,0.70)", // neutro médio
  sav: "rgba(161,161,170,0.65)", // neutro claro
  saldo: "rgba(33,99,84,1.00)", // cor de destaque (acompanha --ui-fab-bg por defeito)
  incF: "rgba(24,24,27,0.18)",
  expF: "rgba(107,114,128,0.16)",
  savF: "rgba(161,161,170,0.14)",
};

// Chart helpers
export const axisMoney = {
  ticks: {
    callback: (v) => money(v),
  },
};

export const parsedValue = (ctx) => {
  const ds = ctx.chart?.data?.datasets?.[ctx.datasetIndex] || {};
  const ix = ds.indexAxis || ctx.chart?.options?.indexAxis || "x";
  if (ctx.parsed && typeof ctx.parsed === "object") {
    return ix === "y" ? ctx.parsed.x : ctx.parsed.y;
  }
  return ctx.parsed ?? 0;
};

export const toolMoney = {
  callbacks: {
    label: (ctx) => {
      const lbl = ctx.dataset?.label ? `${ctx.dataset.label}: ` : "";
      return lbl + money(parsedValue(ctx));
    },
  },
};

export const ptDate = (iso) => new Date(iso).toLocaleDateString("pt-PT");

// A11y: Focus Trap helper for Modals
export function trapFocus(element) {
  const focusableEls = element.querySelectorAll(
    'a[href]:not([disabled]), button:not([disabled]), textarea:not([disabled]), input[type="text"]:not([disabled]), input[type="radio"]:not([disabled]), input[type="checkbox"]:not([disabled]), select:not([disabled])'
  );
  if (!focusableEls.length) return;

  const first = focusableEls[0];
  const last = focusableEls[focusableEls.length - 1];

  element.addEventListener("keydown", function (e) {
    const isTabPressed = e.key === "Tab" || e.keyCode === 9;
    if (!isTabPressed) return;

    if (e.shiftKey) {
      if (document.activeElement === first) {
        last.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
  });
  
  // Auto focus first element
  setTimeout(() => first.focus(), 50);
}

