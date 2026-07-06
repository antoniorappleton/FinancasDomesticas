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
import {
  calculateRoutineFixedAverage,
  projectCashflow as projectDashboardCashflow,
} from "../lib/analytics.js";
import { money } from "../lib/helpers.js";
import Guide from "../lib/guide.js";
import { loadTheme } from "../lib/theme.js";

let healthChart = null;
let currentLayer = "net";
let monthlyData = [];
let healthContext = {};

export async function init({ sb, outlet } = {}) {
  sb = sb || window.sb;
  if (sb) await loadTheme(sb);
  outlet = outlet || document.getElementById("outlet");

  // Wait for critical DOM elements to be ready
  const waitForElements = async (selectors, maxTries = 20) => {
    for (let i = 0; i < maxTries; i++) {
      const allExist = selectors.every(s => outlet?.querySelector(s) || document.querySelector(s));
      if (allExist) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  };

  await waitForElements(["#health-chart", "#indicators-grid", "#health-score"]);

  try {
    // 1. Fetch aligned data and DB context
    const dataset = await fetchHealthDataset(sb);
    monthlyData = dataset.monthlyData;
    healthContext = dataset.context;

    if (!monthlyData || !monthlyData.length) {
      renderEmptyState(outlet);
      return;
    }

    // 2. Calculate metrics
    const metrics = calculateHealthMetrics(monthlyData, healthContext);
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

async function fetchHealthDataset(sb) {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthKey = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const historyFrom = `${currentYear - 1}-01-01`;
    const historyTo = `${currentYear + 1}-01-01`;
    const last12From = new Date(currentYear, now.getMonth() - 11, 1);

    const [{ data: tInc }, { data: tExp }, { data: tSav }, userRes] = await Promise.all([
      sb.from("transaction_types").select("id").eq("code", "INCOME").single(),
      sb.from("transaction_types").select("id").eq("code", "EXPENSE").single(),
      sb.from("transaction_types").select("id").eq("code", "SAVINGS").single(),
      sb.auth.getUser(),
    ]);

    const incId = tInc?.id;
    const expId = tExp?.id;
    const savId = tSav?.id;
    const uid = userRes?.data?.user?.id;

    const [txRes, settingsRes, objectivesRes, savingsCategoriesRes] = await Promise.all([
      sb
        .from("transactions")
        .select(
          "date, amount, type_id, category_id, expense_nature, regularities(code,name_pt), categories(name,parent_id,expense_nature_default)",
        )
        .gte("date", historyFrom)
        .lt("date", historyTo)
        .order("date", { ascending: true }),
      uid
        ? sb
            .from("user_settings")
            .select("avg_fixed_expenses,emergency_months")
            .eq("user_id", uid)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      sb
        .from("objectives")
        .select("id,title,type,category_id,current_amount,target_amount,due_date,is_active")
        .eq("is_active", true),
      sb.from("categories").select("id,name,parent_id,kind").eq("kind", "savings"),
    ]);

    const txs = txRes.data || [];
    const settings = settingsRes.data || {};
    const objectives = objectivesRes.data || [];
    const savingsCategories = savingsCategoriesRes.data || [];

    const allHistoryMap = new Map();
    const fixedVarByMonth = new Map();
    const annualFixedByMonth = new Map();

    for (let month = 1; month <= 12; month++) {
      const key = `${currentYear}-${String(month).padStart(2, "0")}`;
      allHistoryMap.set(key, { income: 0, expense: 0, savings: 0, net: 0 });
      fixedVarByMonth.set(key, { fixed: 0, variable: 0 });
    }

    txs.forEach((tx) => {
      const key = String(tx.date).slice(0, 7);
      const row = allHistoryMap.get(key) || { income: 0, expense: 0, savings: 0, net: 0 };
      const fv = fixedVarByMonth.get(key) || { fixed: 0, variable: 0 };
      const amount = Math.abs(Number(tx.amount) || 0);

      if (tx.type_id === incId) {
        row.income += amount;
      } else if (tx.type_id === expId) {
        row.expense += amount;
        if (isFixedExpense(tx)) {
          fv.fixed += amount;
          if (isAnnualExpense(tx)) {
            annualFixedByMonth.set(key, (annualFixedByMonth.get(key) || 0) + amount);
          }
        } else {
          fv.variable += amount;
        }
      } else if (tx.type_id === savId) {
        row.savings += amount;
      }

      row.net = row.income - row.expense - row.savings;
      allHistoryMap.set(key, row);
      fixedVarByMonth.set(key, fv);
    });

    const monthlyData = monthKeysBetween(last12From, now).map((key) => {
      const row = allHistoryMap.get(key) || { income: 0, expense: 0, savings: 0, net: 0 };
      const fv = fixedVarByMonth.get(key) || { fixed: 0, variable: 0 };
      return {
        month: key,
        label: formatMonthLabel(key),
        income: Number(row.income) || 0,
        expense: Number(row.expense) || 0,
        savings: Number(row.savings) || 0,
        net: Number(row.net) || 0,
        fixed: Number(fv.fixed) || 0,
        variable: Number(fv.variable) || 0,
      };
    });

    const emergencyFundBalance = await fetchEmergencyFundBalance(sb, {
      savId,
      objectives,
      savingsCategories,
    });

    const projectionSettings = getProjectionSettings(settings, currentYear);
    const routineAvg = calculateRoutineFixedAverage(
      fixedVarByMonth,
      annualFixedByMonth,
      String(currentYear),
      currentMonthKey,
    );
    const projectionSeries = projectDashboardCashflow(
      String(currentYear),
      allHistoryMap,
      fixedVarByMonth,
      annualFixedByMonth,
      projectionSettings,
      routineAvg,
    );

    return {
      monthlyData,
      context: {
        avgFixedExpenses: Number(settings.avg_fixed_expenses) || 0,
        emergencyMonthsTarget: Number(settings.emergency_months) || 6,
        emergencyFundBalance,
        projectionSeries,
      },
    };
  } catch (err) {
    console.error("[Health] Fetch error:", err);
    return { monthlyData: [], context: {} };
  }
}

function monthKeysBetween(fromDate, toDate) {
  const out = [];
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
  while (d <= end) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

function getProjectionSettings(settings, year) {
  try {
    return JSON.parse(localStorage.getItem(`wb:fixed:${year}`) || "{}");
  } catch {
    return {};
  }
}

async function fetchEmergencyFundBalance(sb, { savId, objectives, savingsCategories }) {
  const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const emergencyObjectives = (objectives || []).filter((o) => {
    const title = normalize(o.title);
    return o.type === "savings_goal" && title.includes("emerg");
  });

  const categoryIds = new Set(emergencyObjectives.map((o) => o.category_id).filter(Boolean));
  const byParent = new Map();
  (savingsCategories || []).forEach((cat) => {
    if (!cat.parent_id) return;
    const list = byParent.get(cat.parent_id) || [];
    list.push(cat.id);
    byParent.set(cat.parent_id, list);
  });
  (savingsCategories || [])
    .filter((cat) => normalize(cat.name).includes("emerg"))
    .forEach((cat) => {
      categoryIds.add(cat.id);
      (byParent.get(cat.id) || []).forEach((childId) => categoryIds.add(childId));
    });

  const manualTotal = emergencyObjectives.reduce(
    (sum, o) => sum + Math.max(0, Number(o.current_amount) || 0),
    0,
  );

  if (!savId || !categoryIds.size) return manualTotal;

  const { data, error } = await sb
    .from("transactions")
    .select("amount,category_id,date")
    .eq("type_id", savId)
    .in("category_id", Array.from(categoryIds));

  if (error) {
    console.warn("[Health] Emergency fund transaction fetch failed:", error.message);
    return manualTotal;
  }

  const autoTotal = (data || []).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  return manualTotal > 0 ? manualTotal : autoTotal;
}
function isFixedExpense(tx) {
  const txNature = tx.expense_nature?.toLowerCase();
  if (txNature && ["fixed", "fixa"].includes(txNature)) return true;

  const catNature = tx.categories?.expense_nature_default?.toLowerCase();
  if (catNature && ["fixed", "fixa"].includes(catNature)) return true;

  const reg = `${tx.regularities?.code || ""} ${tx.regularities?.name_pt || ""}`;
  if (/monthly|mensal|yearly|annual|anual|trimestral|semestral/i.test(reg)) return true;

  const catName = String(tx.categories?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /(renda|prestacao|credito|seguro|internet|agua|luz|gas|condominio|mensalidade|subscricao|assinatura)/.test(catName);
}

function isAnnualExpense(tx) {
  const reg = `${tx.regularities?.code || ""} ${tx.regularities?.name_pt || ""}`;
  return /yearly|annual|anual/i.test(reg);
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

  const series = buildHealthSeries(data, currentLayer, healthContext);

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

  const series = buildHealthSeries(monthlyData, layer, healthContext);

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
  const series = buildHealthSeries(data, layer, healthContext);
  const values = series.values.filter((v) => v !== null);

  const outlet = document.getElementById("outlet");
  const currentEl = outlet.querySelector("#current-value");
  const avgEl = outlet.querySelector("#avg-value");
  const badgeEl = outlet.querySelector("#current-badge");

  // Check if elements exist
  if (!currentEl || !avgEl || !badgeEl) {
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
      help: "Percentagem do teu rendimento que já está comprometida com despesas fixas (renda, seguros, prestações). Quanto mais baixo, mais margem tens para imprevistos.",
    },
    {
      icon: "trending_down",
      title: "Esforço Total",
      value: `${metrics.effortTotal}%`,
      status: status.effortTotalStatus,
      barWidth: Math.min(metrics.effortTotal, 100),
      statusText: getStatusText(status.effortTotalStatus, "< 85%"),
      help: "Percentagem do teu rendimento que gastas no total (fixas + variáveis) num mês típico. Acima de 85% sobra pouco para poupar ou lidar com imprevistos.",
    },
    {
      icon: "savings",
      title: "Taxa de Poupança",
      value: `${metrics.savingsRate}%`,
      status: status.savingsRateStatus,
      barWidth: Math.min(metrics.savingsRate, 100),
      statusText: getStatusText(status.savingsRateStatus, ">= 10%"),
      help: "Percentagem do teu rendimento que efetivamente guardas todos os meses. Regra geral: quanto mais alto, melhor — 10% ou mais é um bom ponto de partida.",
    },
    {
      icon: "show_chart",
      title: "Liquidez",
      value: money(metrics.liquidityAccumulated),
      status: status.liquidityStatus,
      barWidth: 0, // No bar for liquidity (it's an absolute value)
      statusText: `Tendência: ${metrics.liquidityTrend === "up" ? "↑ Subida" : metrics.liquidityTrend === "down" ? "↓ Descida" : "→ Estável"}`,
      help: "Dinheiro acumulado (receitas menos despesas) ao longo do período analisado. É o teu 'colchão' disponível.",
    },
    {
      icon: "account_balance",
      title: "Fundo de Emergência",
      value: `${(metrics.emergencyFund?.currentCoverage ?? 0).toFixed(1)} meses`,
      status: status.emergencyFundStatus || "critical",
      barWidth: 0,
      statusText: `Atual: ${money(metrics.emergencyFund?.currentAmount ?? 0)} · Alvo: ${metrics.emergencyFund?.targetMonths ?? 6} meses (${money(metrics.emergencyFund?.targetAmount ?? metrics.emergencyFund?.sixMonths ?? 0)})`,
      help: "Quantos meses de despesas fixas consegues cobrir com o que tens acumulado, caso deixes de ter rendimento. 3 a 6 meses é o intervalo recomendado.",
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
      help: "Número de meses seguidos em que gastaste mais do que recebeste. Vários meses seguidos negativos é um sinal de alerta.",
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
      help: "Mede o quanto as tuas despesas mensais variam de mês para mês. Despesas muito irregulares dificultam o planeamento.",
    },
  ];

  grid.innerHTML = indicators.map((ind, idx) => renderIndicator(ind, idx)).join("");

  grid.querySelectorAll(".indicator-help-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".indicator")?.querySelector(".indicator-help-text")?.classList.toggle("hidden");
    });
  });
}

function renderIndicator(ind, idx) {
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
        ${
          ind.help
            ? `<button type="button" class="indicator-help-btn btn-icon-small" title="O que é isto?" aria-label="Explicação de ${ind.title}">
                 <span class="material-symbols-outlined" style="font-size:16px">help_outline</span>
               </button>`
            : ""
        }
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
      ${
        ind.help
          ? `<p class="indicator-help-text hidden muted" style="margin-top:6px; font-size:0.8rem">${ind.help}</p>`
          : ""
      }
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
