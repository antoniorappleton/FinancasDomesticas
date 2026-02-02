// src/lib/analytics.js

/**
 * Calculates average of "Routine" Fixed Expenses (excluding Annuals) for current year.
 * 
 * @param {Map} fixedVarMap - Map of month keys to { fixed, variable }
 * @param {Map} annualMap - Map of month keys to total ANNUAL fixed amount (to exclude)
 * @param {string} currentMonthKey - Cut-off month (e.g. "2026-02")
 * @returns {number} Average Routine Fixed Expense
 */
export function calculateRoutineFixedAverage(fixedVarMap, annualMap, currentYear, currentMonthKey) {
  let sum = 0;
  let count = 0;
  
  // Iterate months of current year up to currentMonthKey
  for (let i = 1; i <= 12; i++) {
    const key = `${currentYear}-${String(i).padStart(2, "0")}`;
    if (key > currentMonthKey) break;

    const fv = fixedVarMap?.get(key);
    const ann = annualMap?.get(key) || 0;
    
    if (fv) {
      const totalFixed = Math.abs(Number(fv.fixed || 0));
      // Routine = Total - Annual (clamped to 0)
      const routine = Math.max(0, totalFixed - ann);
      sum += routine;
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Projects cashflow using Hybrid Logic:
 * - Income/Variable: Mirror of Homologous (Year-1).
 * - Fixed: Mix of (30% HomologousRoutine + 70% YTDAvgRoutine) + Annual.
 * 
 * @param {string} targetYear - Year to project (e.g. "2026")
 * @param {Map} historyMap - Monthly data (for Income/Net reference)
 * @param {Map} fixedVarMap - Monthly fixed/variable breakdown
 * @param {Map} annualMap - Monthly sum of "Annual" frequency expenses (for explicit addition)
 * @param {Object} manualAdjustments - Manual overrides
 * @param {number} routineAvg - The calculated YTD average for routine fixed expenses
 * @returns {Object} Arrays for charts
 */
export function projectCashflow(targetYear, historyMap, fixedVarMap, annualMap, manualAdjustments, routineAvg) {
  const labels = [];
  const netFixed = [];
  const cumFixed = [];
  const netTotal = [];
  const cumTotal = [];

  let runFixed = 0;
  let runTotal = 0;

  const now = new Date();
  let currentMonthKey;
  if (targetYear === String(now.getFullYear())) {
    currentMonthKey = `${targetYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  } else if (targetYear < String(now.getFullYear())) {
    currentMonthKey = `${targetYear}-13`;
  } else {
    currentMonthKey = `${targetYear}-00`;
  }

  const prevYear = String(Number(targetYear) - 1);
  const enabled = !!manualAdjustments?.enabled;
  const items = Array.isArray(manualAdjustments?.items) ? manualAdjustments.items : [];

  const getManualExtra = (m) => {
    if (!enabled || !items.length) return 0;
    return items.reduce((acc, it) => {
      const apply = Array.isArray(it.months) ? it.months.includes(m) : true;
      return acc + (apply ? Math.max(0, Number(it.amount || 0)) : 0);
    }, 0);
  };

  for (let i = 1; i <= 12; i++) {
    const keyTarget = `${targetYear}-${String(i).padStart(2, "0")}`;
    const label = new Date(Number(targetYear), i - 1, 1).toLocaleDateString(
      "pt-PT",
      { month: "short", year: "numeric" }
    );
    labels.push(label);

    let netValFixed = 0;
    let netValTotal = 0;

    if (keyTarget <= currentMonthKey) {
      // --- ACTUALS ---
      const realData = historyMap?.get(keyTarget);
      const realFV = fixedVarMap?.get(keyTarget);

      const inc = realData ? Number(realData.income || 0) : 0;
      const exp = realData ? Math.abs(Number(realData.expense || 0)) : 0; // Total Exp
      const fixed = realFV ? Math.abs(Number(realFV.fixed || 0)) : 0;

      netValFixed = inc - fixed;
      netValTotal = inc - exp; 

    } else {
      // --- PROJECTION ---
      // 1. Get Homologous Data (Year - 1)
      const keyPrev = `${prevYear}-${String(i).padStart(2, "0")}`;
      const histData = historyMap?.get(keyPrev);
      const histFV = fixedVarMap?.get(keyPrev);
      const histAnnual = annualMap?.get(keyPrev) || 0; // Annuals that happened last year (assume repeat)

      // Mirror Income & Variable from Homologous
      const projIncome = histData ? Number(histData.income || 0) : 0;
      const histVariable = histFV ? Math.abs(Number(histFV.variable || 0)) : 0;

      // Fixed Calculation
      // Homologous Routine = TotalFixed(Prev) - Annual(Prev)
      const histFixedTotal = histFV ? Math.abs(Number(histFV.fixed || 0)) : 0;
      const histRoutine = Math.max(0, histFixedTotal - histAnnual);

      // Hybrid Routine = (0.3 * Homologous) + (0.7 * RecentAvg)
      const projRoutine = (0.3 * histRoutine) + (0.7 * routineAvg);

      // Total Projected Fixed = Routine + Annual(Mirror) + Manual
      const manual = getManualExtra(i);
      const projFixed = projRoutine + histAnnual + manual;
      
      const projTotalExp = projFixed + histVariable;

      netValFixed = projIncome - projFixed;
      netValTotal = projIncome - projTotalExp;
    }

    runFixed += netValFixed;
    runTotal += netValTotal;

    netFixed.push(netValFixed);
    cumFixed.push(runFixed);
    netTotal.push(netValTotal);
    cumTotal.push(runTotal);
  }

  return { labels, netFixed, cumFixed, netTotal, cumTotal };
}
