/**
 * health.js
 * Financial Health Coach Screen Controller
 */

import {
  calculateHealthMetrics,
  buildHealthSeries,
  getHealthStatus,
} from "../lib/healthMetrics.js";
import { makeChart } from "../lib/chart-loader.js";
import { money } from "../lib/helpers.js";
import Guide from "../lib/guide.js";
import { loadTheme } from "../lib/theme.js";

let healthChart = null;
let currentLayer = "net";
let monthlyData = [];

export async function init({ sb, outlet } = {}) {
  sb = sb || window.sb;
  if (sb) await loadTheme(sb);
  outlet = outlet || document.getElementById("outlet");

  // Wait for DOM to be fully rendered (increased delay for complex HTML)
  await new Promise((resolve) => setTimeout(resolve, 200));

  try {
    // 1. Fetch last 12 months data
    monthlyData = await fetchLast12Months(sb);

    if (!monthlyData || !monthlyData.length) {
      renderEmptyState(outlet);
      return;
    }

    // 2. Calculate metrics
    const metrics = calculateHealthMetrics(monthlyData);
    const status = getHealthStatus(metrics);

    // 3. Render health score
    renderHealthScore(status, metrics);

    // 4. Create super chart
    await createHealthChart(monthlyData);

    // 5. Setup filter buttons
    setupLayerToggles();

    // 6. Render indicators grid
    renderIndicators(metrics, status);

    // 7. Render alerts (if any)
    renderAlerts(status.alerts);

    // Contextual Help
    // We let Guide.js handle the injection. We just ensure the route is set.
    Guide.setRoute("#/health");
    Guide.mountScreenButton();

    // 8. Update metric summary for initial layer
    updateMetricSummary(currentLayer, monthlyData);
  } catch (err) {
    console.error("[Health] Init error:", err);
    renderErrorState(outlet, err);
  }
}

export function cleanup() {
  if (healthChart) {
    healthChart.destroy();
    healthChart = null;
  }
}

// ===== Data Fetching =====

async function fetchLast12Months(sb) {
  try {
    // Calculate date range (last 12 months)
    const now = new Date();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1); // Start of next month
    const from = new Date(now.getFullYear() - 1, now.getMonth(), 1); // 12 months ago

    const ymd = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const fromStr = ymd(from);
    const toStr = ymd(to);

    // Fetch transaction types
    const [{ data: tInc }, { data: tExp }, { data: tSav }] = await Promise.all([
      sb.from("transaction_types").select("id").eq("code", "INCOME").single(),
      sb.from("transaction_types").select("id").eq("code", "EXPENSE").single(),
      sb.from("transaction_types").select("id").eq("code", "SAVINGS").single(),
    ]);

    const incId = tInc?.id;
    const expId = tExp?.id;
    const savId = tSav?.id;

    // Fetch transactions
    const { data: txs } = await sb
      .from("transactions")
      .select(
        "date, amount, type_id, expense_nature, categories(expense_nature_default)",
      )
      .gte("date", fromStr)
      .lt("date", toStr)
      .order("date", { ascending: true });

    // Group by month
    const monthsMap = new Map();

    (txs || []).forEach((tx) => {
      const monthKey = tx.date.slice(0, 7); // YYYY-MM
      if (!monthsMap.has(monthKey)) {
        monthsMap.set(monthKey, {
          month: monthKey,
          label: formatMonthLabel(monthKey),
          income: 0,
          expense: 0,
          savings: 0,
          net: 0,
          fixed: 0,
          variable: 0,
        });
      }

      const month = monthsMap.get(monthKey);
      const amt = Number(tx.amount) || 0;

      if (tx.type_id === incId) {
        month.income += amt;
      } else if (tx.type_id === expId) {
        month.expense += amt;

        // Classify as fixed or variable
        const isFixed = isFixedExpense(tx);
        if (isFixed) {
          month.fixed += Math.abs(amt);
        } else {
          month.variable += Math.abs(amt);
        }
      } else if (tx.type_id === savId) {
        month.savings += Math.abs(amt);
      }
    });

    // Calculate net for each month
    monthsMap.forEach((m) => {
      m.net = m.income - Math.abs(m.expense) - Math.abs(m.savings);
    });

    // Convert to sorted array
    return Array.from(monthsMap.values()).sort((a, b) =>
      a.month.localeCompare(b.month),
    );
  } catch (err) {
    console.error("[Health] Fetch error:", err);
    return [];
  }
}

function isFixedExpense(tx) {
  // Check explicit expense_nature first
  const txNature = tx.expense_nature?.toLowerCase();
  if (txNature && ["fixed", "fixa"].includes(txNature)) return true;

  // Check category default
  const catNature = tx.categories?.expense_nature_default?.toLowerCase();
  if (catNature && ["fixed", "fixa"].includes(catNature)) return true;

  // Default to variable if not specified
  return false;
}

function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString("pt-PT", { month: "short", year: "numeric" });
}

// ===== Chart Creation =====

async function createHealthChart(data) {
  const outlet = document.getElementById("outlet");
  const canvas = outlet.querySelector("#health-chart");
  if (!canvas) return;

  const series = buildHealthSeries(data, currentLayer);

  healthChart = await makeChart(canvas, {
    type: series.type,
    data: {
      labels: series.labels,
      datasets: [
        {
          label: series.label,
          data: series.values,
          backgroundColor: series.type === "bar" ? series.color : "transparent",
          borderColor: series.color,
          borderWidth: 2,
          tension: 0.25,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const value = ctx.parsed.y;
              if (
                currentLayer.includes("effort") ||
                currentLayer === "savingsRate"
              ) {
                return ` ${value.toFixed(1)}%`;
              }
              return ` ${money(value)}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => {
              if (
                currentLayer.includes("effort") ||
                currentLayer === "savingsRate"
              ) {
                return value + "%";
              }
              return money(value);
            },
          },
        },
      },
    },
  });
}

// ===== Layer Toggles ====

function setupLayerToggles() {
  const outlet = document.getElementById("outlet");
  const buttons = outlet.querySelectorAll("[data-layer]");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const layer = btn.dataset.layer;

      // Update UI
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Update current layer
      currentLayer = layer;

      // Rebuild chart
      updateChart(layer);

      // Update metric summary
      updateMetricSummary(layer, monthlyData);
    });
  });
}

function updateChart(layer) {
  if (!healthChart) return;

  const series = buildHealthSeries(monthlyData, layer);

  // Update chart type if needed
  if (healthChart.config.type !== series.type) {
    healthChart.destroy();
    createHealthChart(monthlyData);
    return;
  }

  // Update data
  healthChart.data.labels = series.labels;
  healthChart.data.datasets[0] = {
    label: series.label,
    data: series.values,
    backgroundColor: series.type === "bar" ? series.color : "transparent",
    borderColor: series.color,
    borderWidth: 2,
    tension: 0.25,
    fill: false,
  };

  healthChart.update();
}

// ===== Metric Summary =====

function updateMetricSummary(layer, data) {
  const series = buildHealthSeries(data, layer);
  const values = series.values.filter((v) => v !== null);

  const outlet = document.getElementById("outlet");
  const currentEl = outlet.querySelector("#current-value");
  const avgEl = outlet.querySelector("#avg-value");
  const badgeEl = outlet.querySelector("#current-badge");

  // Check if elements exist
  if (!currentEl || !avgEl || !badgeEl) {
    console.warn("[Health] Metric summary elements not found");
    return;
  }

  if (!values.length) {
    currentEl.textContent = "--";
    avgEl.textContent = "--";
    badgeEl.textContent = "";
    return;
  }

  const current = values[values.length - 1];
  const last6 = values.slice(-6);
  const avg = last6.reduce((sum, v) => sum + v, 0) / last6.length;

  // Format values
  if (layer.includes("effort") || layer === "savingsRate") {
    currentEl.textContent = `${current.toFixed(1)}%`;
    avgEl.textContent = `${avg.toFixed(1)}%`;
  } else {
    currentEl.textContent = money(current);
    avgEl.textContent = money(avg);
  }

  // Calculate difference
  const diff = avg !== 0 ? ((current - avg) / Math.abs(avg)) * 100 : 0;
  const diffText = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;

  // Determine badge status
  let badgeClass = "badge-ok";
  let isGoodDirection = false;

  switch (layer) {
    case "net":
    case "liquidity":
    case "savingsRate":
      isGoodDirection = diff > 0; // Higher is better
      break;
    case "effortFixed":
    case "effortTotal":
      isGoodDirection = diff < 0; // Lower is better
      break;
    case "projection":
      isGoodDirection = current > 0;
      break;
  }

  if (isGoodDirection) {
    badgeClass = Math.abs(diff) > 10 ? "badge-ok" : "badge-neutral";
  } else {
    badgeClass = Math.abs(diff) > 10 ? "badge-danger" : "badge-warn";
  }

  badgeEl.textContent = diffText;
  badgeEl.className = `metric-badge badge ${badgeClass}`;
}

// ===== Health Score =====

function renderHealthScore(status, metrics) {
  const outlet = document.getElementById("outlet");
  const scoreEl = outlet.querySelector("#health-score");
  const scoreValue = outlet.querySelector("#health-score-value");
  const statusText = outlet.querySelector("#health-status-text");
  const statusSubtitle = outlet.querySelector("#health-status-subtitle");

  if (scoreValue) scoreValue.textContent = status.overallScore;
  if (scoreEl) scoreEl.dataset.status = status.overallHealth;

  const statusLabels = {
    excellent: "Excelente",
    good: "Boa",
    concerning: "Preocupante",
    critical: "Crítica",
  };

  if (statusText)
    statusText.textContent = `Saúde Financeira: ${statusLabels[status.overallHealth] || "Boa"}`;
  if (statusSubtitle)
    statusSubtitle.textContent = `Baseado em ${Object.keys(metrics).length} indicadores`;
}

// ===== Indicators Grid =====

function renderIndicators(metrics, status) {
  const outlet = document.getElementById("outlet");
  const grid = outlet.querySelector("#indicators-grid");
  if (!grid) return;

  const indicators = [
    {
      icon: "home",
      title: "Esforço Fixo",
      value: `${metrics.effortFixed}%`,
      status: status.effortFixedStatus,
      barWidth: Math.min(metrics.effortFixed, 100),
      statusText: getStatusText(status.effortFixedStatus, "< 40%"),
    },
    {
      icon: "trending_down",
      title: "Esforço Total",
      value: `${metrics.effortTotal}%`,
      status: status.effortTotalStatus,
      barWidth: Math.min(metrics.effortTotal, 100),
      statusText: getStatusText(status.effortTotalStatus, "< 85%"),
    },
    {
      icon: "savings",
      title: "Taxa de Poupança",
      value: `${metrics.savingsRate}%`,
      status: status.savingsRateStatus,
      barWidth: Math.min(metrics.savingsRate, 100),
      statusText: getStatusText(status.savingsRateStatus, "≥ 10%"),
    },
    {
      icon: "show_chart",
      title: "Liquidez",
      value: money(metrics.liquidityAccumulated),
      status: status.liquidityStatus,
      barWidth: 0, // No bar for liquidity (it's an absolute value)
      statusText: `Tendência: ${metrics.liquidityTrend === "up" ? "↑ Subida" : metrics.liquidityTrend === "down" ? "↓ Descida" : "→ Estável"}`,
    },
    {
      icon: "account_balance",
      title: "Fundo de Emergência",
      value: `${(metrics.emergencyFund?.currentCoverage ?? 0).toFixed(1)} meses`,
      status: status.emergencyFundStatus || "critical",
      barWidth: 0,
      statusText: `Recomendado: 3-6 meses (${money(metrics.emergencyFund?.threeMonths ?? 0)} - ${money(metrics.emergencyFund?.sixMonths ?? 0)})`,
    },
    {
      icon: "warning",
      title: "Saldos Negativos",
      value: `${metrics.consecutiveNegativeMonths} ${metrics.consecutiveNegativeMonths === 1 ? "mês" : "meses"}`,
      status:
        metrics.consecutiveNegativeMonths === 0
          ? "excellent"
          : metrics.consecutiveNegativeMonths < 2
            ? "healthy"
            : "critical",
      barWidth: 0,
      statusText:
        metrics.consecutiveNegativeMonths === 0
          ? "Sem consecutivos"
          : "Atenção!",
    },
    {
      icon: "trending_up",
      title: "Regularidade",
      value: metrics.irregularSpending ? "Irregular" : "Regular",
      status: metrics.irregularSpending ? "risk" : "excellent",
      barWidth: 0,
      statusText: metrics.irregularSpending
        ? "Alta variabilidade"
        : "Despesas estáveis",
    },
  ];

  grid.innerHTML = indicators.map((ind) => renderIndicator(ind)).join("");
}

function renderIndicator(ind) {
  const statusColors = {
    excellent: "#22c55e",
    healthy: "#3b82f6",
    good: "#3b82f6",
    risk: "#f59e0b",
    concerning: "#f59e0b",
    poor: "#ef4444",
    critical: "#ef4444",
  };

  const color = statusColors[ind.status] || "#64748b";

  return `
    <div class="indicator" data-status="${ind.status}">
      <div class="indicator-header">
        <span class="material-symbols-outlined indicator-icon">${ind.icon}</span>
        <span class="indicator-title">${ind.title}</span>
      </div>
      <div class="indicator-value">${ind.value}</div>
      ${
        ind.barWidth > 0
          ? `
        <div class="indicator-bar">
          <div class="bar-fill" style="width: ${ind.barWidth}%; background: ${color}"></div>
        </div>
      `
          : ""
      }
      <div class="indicator-status">${ind.statusText}</div>
    </div>
  `;
}

function getStatusText(status, recommendation) {
  const labels = {
    excellent: `Excelente (${recommendation})`,
    healthy: `Saudável (${recommendation})`,
    good: `Bom (${recommendation})`,
    risk: `Atenção (${recommendation})`,
    concerning: `Preocupante (${recommendation})`,
    poor: `Fraco (${recommendation})`,
    critical: `Crítico (${recommendation})`,
  };
  return labels[status] || recommendation;
}

// ===== Alerts =====

function renderAlerts(alerts) {
  const outlet = document.getElementById("outlet");
  const section = outlet.querySelector("#alerts-section");
  const list = outlet.querySelector("#alerts-list");

  if (!alerts || !alerts.length) {
    if (section) section.hidden = true;
    return;
  }

  if (!section || !list) {
    console.warn("[Health] Alerts section or list element not found");
    return;
  }

  section.hidden = false;

  const severityIcons = {
    high: "error",
    medium: "warning",
    low: "check_circle",
  };

  list.innerHTML = alerts
    .map(
      (alert) => `
    <div class="alert alert-${alert.severity}">
      <span class="material-symbols-outlined alert-icon">${severityIcons[alert.severity] || "info"}</span>
      <span class="alert-message">${alert.message}</span>
    </div>
  `,
    )
    .join("");
}

// ===== Empty/Error States =====

function renderEmptyState(outlet) {
  const target = outlet.querySelector(".card") || outlet;
  target.innerHTML = `
    <div style="text-align: center; padding: 48px 16px;">
      <p class="muted">Sem dados suficientes para calcular a saúde financeira.</p>
      <p class="muted">Comece a registar as suas transações!</p>
    </div>
  `;
}

function renderErrorState(outlet, err) {
  const target = outlet.querySelector(".card") || outlet;
  target.innerHTML = `
    <div style="text-align: center; padding: 48px 16px;">
      <p class="muted">Erro ao carregar dados: ${err.message}</p>
      <p class="muted">Tente recarregar a página.</p>
    </div>
  `;
}
