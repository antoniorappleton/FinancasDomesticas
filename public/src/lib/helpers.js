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

// Color palette for charts
export function palette(n) {
  const base = [
    "#0ea5e9",
    "#22c55e",
    "#f97316",
    "#a78bfa",
    "#ef4444",
    "#14b8a6",
    "#eab308",
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

// Shared chart colors
export const CHART_COLORS = {
  inc: "rgba(16,185,129,0.85)", // green
  exp: "rgba(239,68,68,0.85)", // red
  sav: "rgba(59,130,246,0.85)", // blue
  saldo: "rgba(99,102,241,1.00)", // violet
  incF: "rgba(16,185,129,0.28)",
  expF: "rgba(239,68,68,0.25)",
  savF: "rgba(59,130,246,0.22)",
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

