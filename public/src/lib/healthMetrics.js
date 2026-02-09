/**
 * healthMetrics.js
 * Centralized financial health calculations
 * Provides metrics for effort ratios, savings rate, liquidity, and projections
 */

import { money } from "./helpers.js";

/**
 * Calculate comprehensive health metrics from monthly data
 * @param {Array} monthlyData - Array of {month, income, expense, savings, net, fixed?, variable?}
 * @param {Object} settings - Optional user settings
 * @returns {Object} Health metrics object
 */
export function calculateHealthMetrics(monthlyData, settings = {}) {
  if (!monthlyData || !monthlyData.length) {
    return getEmptyMetrics();
  }

  // Get latest month data
  const latest = monthlyData[monthlyData.length - 1];
  const income = Number(latest.income) || 0;
  const expense = Math.abs(Number(latest.expense)) || 0;
  const savings = Math.abs(Number(latest.savings)) || 0;
  const net = Number(latest.net) || 0;
  const fixed = Math.abs(Number(latest.fixed)) || 0;
  const variable = Math.abs(Number(latest.variable)) || 0;

  // Calculate effort ratios
  const effortFixed = income > 0 ? (fixed / income) * 100 : 0;
  const effortTotal = income > 0 ? ((expense + savings) / income) * 100 : 0;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;

  // Calculate liquidity (accumulated net over time)
  let liquidityAccumulated = 0;
  monthlyData.forEach((m) => {
    liquidityAccumulated += Number(m.net) || 0;
  });

  // Determine liquidity trend (last 3 months)
  const last3 = monthlyData.slice(-3);
  const netTrend = last3.map((m) => Number(m.net) || 0);
  const avgNet = netTrend.reduce((a, b) => a + b, 0) / netTrend.length;
  const liquidityTrend =
    avgNet > 100 ? "up" : avgNet < -100 ? "down" : "stable";

  // Risk indicators
  const consecutiveNegativeMonths = countConsecutiveNegative(monthlyData);

  // Top category weight (if available in latest data)
  const topCategoryWeight = latest.topCategory
    ? {
        name: latest.topCategory.name,
        percentage: latest.topCategory.percentage,
      }
    : { name: "N/A", percentage: 0 };

  // Irregular spending detection (high variance in last 6 months)
  const last6Expenses = monthlyData
    .slice(-6)
    .map((m) => Math.abs(Number(m.expense)) || 0);
  const avgExpense =
    last6Expenses.reduce((a, b) => a + b, 0) / last6Expenses.length;
  const variance =
    last6Expenses.reduce((sum, val) => sum + Math.pow(val - avgExpense, 2), 0) /
    last6Expenses.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation =
    avgExpense > 0 ? (stdDev / avgExpense) * 100 : 0;
  const irregularSpending = coefficientOfVariation > 30; // High variance threshold

  // Projections (simple 3-month forecast based on average)
  const projected3Months = projectCashflow(monthlyData, 3);

  // Calculate months until negative liquidity (if trending down)
  const monthsUntilNegative = calculateMonthsUntilNegative(
    liquidityAccumulated,
    avgNet,
  );

  // Emergency Fund calculations
  const last6Fixed = monthlyData
    .slice(-6)
    .map((m) => Math.abs(Number(m.fixed)) || 0);
  const avgFixedExpenses =
    last6Fixed.reduce((a, b) => a + b, 0) / last6Fixed.length;

  const emergencyFund = {
    avgFixedExpenses: Number(avgFixedExpenses.toFixed(2)),
    threeMonths: Number((avgFixedExpenses * 3).toFixed(2)),
    sixMonths: Number((avgFixedExpenses * 6).toFixed(2)),
    nineMonths: Number((avgFixedExpenses * 9).toFixed(2)),
    currentCoverage:
      avgFixedExpenses > 0
        ? Number((liquidityAccumulated / avgFixedExpenses).toFixed(1))
        : 0,
  };

  return {
    // Current values
    income,
    expense,
    savings,
    net,
    fixed,
    variable,

    // Effort Ratios
    effortFixed: Number(effortFixed.toFixed(1)),
    effortTotal: Number(effortTotal.toFixed(1)),
    savingsRate: Number(savingsRate.toFixed(1)),

    // Liquidity
    liquidityAccumulated: Number(liquidityAccumulated.toFixed(2)),
    liquidityTrend,

    // Risk Indicators
    consecutiveNegativeMonths,
    topCategoryWeight,
    irregularSpending,

    // Emergency Fund
    emergencyFund,

    // Projections
    projected3Months,
    monthsUntilNegative,
  };
}

/**
 * Get health status interpretation from metrics
 * @param {Object} metrics - Output from calculateHealthMetrics
 * @returns {Object} Status object with classifications and alerts
 */
export function getHealthStatus(metrics) {
  const statuses = {
    effortFixedStatus: classifyEffortFixed(metrics.effortFixed),
    effortTotalStatus: classifyEffortTotal(metrics.effortTotal),
    savingsRateStatus: classifySavingsRate(metrics.savingsRate),
    liquidityStatus: classifyLiquidity(
      metrics.liquidityTrend,
      metrics.liquidityAccumulated,
    ),
    emergencyFundStatus: classifyEmergencyFund(
      metrics.emergencyFund.currentCoverage,
    ),
  };

  // Calculate overall health score (0-100)
  const scores = {
    effortFixed: getScoreFromStatus(statuses.effortFixedStatus),
    effortTotal: getScoreFromStatus(statuses.effortTotalStatus),
    savingsRate: getScoreFromStatus(statuses.savingsRateStatus),
    liquidity: getScoreFromStatus(statuses.liquidityStatus),
    emergencyFund: getScoreFromStatus(statuses.emergencyFundStatus),
  };

  const overallScore = Math.round(
    (scores.effortFixed +
      scores.effortTotal +
      scores.savingsRate +
      scores.liquidity +
      scores.emergencyFund) /
      5,
  );

  const overallHealth =
    overallScore >= 80
      ? "excellent"
      : overallScore >= 60
        ? "good"
        : overallScore >= 40
          ? "concerning"
          : "critical";

  // Generate alerts
  const alerts = [];

  if (metrics.effortFixed > 50) {
    alerts.push({
      type: "effortFixed",
      severity: "high",
      message: `Esforço Fixo muito alto (${metrics.effortFixed}%). Recomenda-se <40%.`,
    });
  }

  if (metrics.consecutiveNegativeMonths >= 2) {
    alerts.push({
      type: "negativeTrend",
      severity: "high",
      message: `${metrics.consecutiveNegativeMonths} meses consecutivos com saldo negativo.`,
    });
  }

  if (metrics.savingsRate < 10) {
    alerts.push({
      type: "lowSavings",
      severity: "medium",
      message: `Taxa de poupança baixa (${metrics.savingsRate}%). Recomenda-se ≥10%.`,
    });
  }

  if (metrics.irregularSpending) {
    alerts.push({
      type: "irregularSpending",
      severity: "low",
      message: "Despesas com alta variabilidade nos últimos 6 meses.",
    });
  }

  if (
    metrics.monthsUntilNegative !== null &&
    metrics.monthsUntilNegative <= 3
  ) {
    alerts.push({
      type: "liquidityRisk",
      severity: "high",
      message: `Projeção: liquidez negativa em ${metrics.monthsUntilNegative} ${metrics.monthsUntilNegative === 1 ? "mês" : "meses"}.`,
    });
  }

  if (metrics.emergencyFund.currentCoverage < 3) {
    const needed =
      metrics.emergencyFund.threeMonths - metrics.liquidityAccumulated;
    alerts.push({
      type: "emergencyFund",
      severity: metrics.emergencyFund.currentCoverage < 1 ? "high" : "medium",
      message: `Fundo de emergência insuficiente (${metrics.emergencyFund.currentCoverage.toFixed(1)} meses). Recomenda-se 3-6 meses de despesas fixas${needed > 0 ? ` (faltam ${money(needed)})` : ""}.`,
    });
  }

  return {
    ...statuses,
    overallHealth,
    overallScore,
    alerts,
  };
}

/**
 * Build time series data for a specific health metric layer
 * @param {Array} monthlyData - Monthly data array
 * @param {String} layer - 'net' | 'liquidity' | 'effortFixed' | 'effortTotal' | 'savingsRate' | 'projection'
 * @returns {Object} Series object with labels, values, color, type
 */
export function buildHealthSeries(monthlyData, layer) {
  const labels = monthlyData.map((m) => m.label || m.month || "");
  let values = [];
  let color = "#3b82f6";
  let type = "line";
  let label = "";

  switch (layer) {
    case "net":
      values = monthlyData.map((m) => Number(m.net) || 0);
      color = "#22c55e";
      label = "Saldo Mensal (€)";
      type = "bar";
      break;

    case "liquidity":
      let cumulative = 0;
      values = monthlyData.map((m) => {
        cumulative += Number(m.net) || 0;
        return cumulative;
      });
      color = "#3b82f6";
      label = "Liquidez Acumulada (€)";
      break;

    case "effortFixed":
      values = monthlyData.map((m) => {
        const income = Number(m.income) || 0;
        const fixed = Math.abs(Number(m.fixed)) || 0;
        return income > 0 ? (fixed / income) * 100 : 0;
      });
      color = "#f59e0b";
      label = "Esforço Fixo (%)";
      break;

    case "effortTotal":
      values = monthlyData.map((m) => {
        const income = Number(m.income) || 0;
        const expense = Math.abs(Number(m.expense)) || 0;
        const savings = Math.abs(Number(m.savings)) || 0;
        return income > 0 ? ((expense + savings) / income) * 100 : 0;
      });
      color = "#ef4444";
      label = "Esforço Total (%)";
      break;

    case "savingsRate":
      values = monthlyData.map((m) => {
        const income = Number(m.income) || 0;
        const savings = Math.abs(Number(m.savings)) || 0;
        return income > 0 ? (savings / income) * 100 : 0;
      });
      color = "#8b5cf6";
      label = "Taxa de Poupança (%)";
      break;

    case "projection":
      // Use actual data + 3-month projection
      const projected = projectCashflow(monthlyData, 3);
      values = monthlyData.map((m) => Number(m.net) || 0);
      // Add projected values
      projected.forEach((p) => {
        labels.push(p.month);
        values.push(p.net);
      });
      color = "#64748b";
      label = "Projeção 3 Meses (€)";
      type = "line";
      break;

    default:
      values = monthlyData.map((m) => Number(m.net) || 0);
      label = "Saldo (€)";
  }

  return {
    labels,
    values,
    color,
    type,
    label,
  };
}

// ===== Helper Functions =====

function getEmptyMetrics() {
  return {
    income: 0,
    expense: 0,
    savings: 0,
    net: 0,
    fixed: 0,
    variable: 0,
    effortFixed: 0,
    effortTotal: 0,
    savingsRate: 0,
    liquidityAccumulated: 0,
    liquidityTrend: "stable",
    consecutiveNegativeMonths: 0,
    topCategoryWeight: { name: "N/A", percentage: 0 },
    irregularSpending: false,
    emergencyFund: {
      avgFixedExpenses: 0,
      threeMonths: 0,
      sixMonths: 0,
      nineMonths: 0,
      currentCoverage: 0,
    },
    projected3Months: [],
    monthsUntilNegative: null,
  };
}

function countConsecutiveNegative(monthlyData) {
  let count = 0;
  for (let i = monthlyData.length - 1; i >= 0; i--) {
    if (Number(monthlyData[i].net) < 0) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function projectCashflow(monthlyData, months) {
  if (!monthlyData.length) return [];

  // Simple projection: average net of last 6 months
  const last6 = monthlyData.slice(-6);
  const avgNet =
    last6.reduce((sum, m) => sum + (Number(m.net) || 0), 0) / last6.length;

  const lastMonth = monthlyData[monthlyData.length - 1];
  const lastDate = new Date(lastMonth.month || new Date());

  const projected = [];
  for (let i = 1; i <= months; i++) {
    const projDate = new Date(lastDate);
    projDate.setMonth(projDate.getMonth() + i);
    const monthKey = projDate.toISOString().slice(0, 7);

    projected.push({
      month: monthKey,
      net: Number(avgNet.toFixed(2)),
      cumulative: 0, // Will be calculated in series builder
    });
  }

  return projected;
}

function calculateMonthsUntilNegative(currentLiquidity, avgMonthlyNet) {
  if (avgMonthlyNet >= 0) return null; // Not trending negative
  if (currentLiquidity <= 0) return 0; // Already negative

  const monthsRemaining = Math.floor(
    currentLiquidity / Math.abs(avgMonthlyNet),
  );
  return monthsRemaining;
}

function classifyEffortFixed(value) {
  if (value < 30) return "excellent";
  if (value < 40) return "healthy";
  if (value < 50) return "risk";
  return "critical";
}

function classifyEffortTotal(value) {
  if (value < 70) return "excellent";
  if (value < 85) return "healthy";
  if (value < 95) return "risk";
  return "critical";
}

function classifySavingsRate(value) {
  if (value >= 20) return "excellent";
  if (value >= 10) return "healthy";
  return "poor";
}

function classifyLiquidity(trend, accumulated) {
  if (trend === "up" && accumulated > 0) return "excellent";
  if (trend === "stable" && accumulated > 0) return "healthy";
  if (trend === "down" && accumulated > 0) return "risk";
  return "critical";
}

function classifyEmergencyFund(coverage) {
  if (coverage >= 9) return "excellent";
  if (coverage >= 6) return "healthy";
  if (coverage >= 3) return "risk";
  return "critical";
}

function getScoreFromStatus(status) {
  const scoreMap = {
    excellent: 100,
    healthy: 75,
    good: 75,
    risk: 50,
    concerning: 50,
    poor: 25,
    critical: 0,
  };
  return scoreMap[status] || 50;
}
