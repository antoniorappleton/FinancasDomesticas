
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

/**
 * Financial Health X-Ray
 * Calculates diagnostics, score, and chart series for a given range.
 * 
 * @param {string} rangeKey - '12m', '6m', or '1m'
 * @param {Map} historyMap - Map<string, {income, expense, ...}>
 * @param {Map} fixedVarMap - Map<string, {fixed, variable}>
 * @param {string} currentMonthKey - 'YYYY-MM' of current month
 * @returns {Object} { metrics, score, phrases, chart }
 */
export function calculateFinancialHealth(rangeKey, historyMap, fixedVarMap, currentMonthKey) {
  // 1. Determine Range Keys
  const keys = [];
  const [y, m] = currentMonthKey.split('-').map(Number);
  const now = new Date(y, m - 1, 1);
  
  let count = 12; // default 12m
  if (rangeKey === '6m') count = 6;
  if (rangeKey === '1m') count = 1;

  for (let i = count - 1; i >= 0; i--) {
     const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
     const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
     keys.push(k);
  }

  // 2. Aggregate Data
  let totInc = 0, totExp = 0, totFixed = 0, totNet = 0;
  let monthsPos = 0;
  const nets = [];
  const cums = [];
  let cum = 0;

  keys.forEach(k => {
     const h = historyMap?.get(k) || {};
     const fv = fixedVarMap?.get(k) || {};
     
     const inc = Number(h.income || 0);
     const exp = Math.abs(Number(h.expense || 0));
     const fixed = Math.abs(Number(fv.fixed || 0));
     const net = inc - exp;

     totInc += inc;
     totExp += exp;
     totFixed += fixed;
     totNet += net;
     
     if (net > 0) monthsPos++;
     nets.push(net);
     cum += net;
     cums.push(cum);
  });

  const avgInc = totInc / count || 0;
  const avgExp = totExp / count || 0;
  const avgNet = totNet / count || 0;
  const avgFixed = totFixed / count || 0;

  // 3. Calculate Metrics
  const savingsRate = totInc > 0 ? (totNet / totInc) * 100 : 0;
  const fixedRatio = totInc > 0 ? (totFixed / totInc) * 100 : 0;
  const consistency = (monthsPos / count) * 100;
  
  // Volatility (Std Dev of Net)
  const variance = nets.reduce((sum, n) => sum + Math.pow(n - avgNet, 2), 0) / count;
  const volatility = Math.sqrt(variance);
  
  // 4. Scoring (0-100)
  // Weights: Savings(30), Consistency(25), Volatility(15), FixedRatio(15), Trend(15)
  // Normalization logic (simple heuristics):
  
  // Savings: target 20% = 100pts? Let's cap at 30%. 
  // Score = min(savingsRate / 20, 1.5) * 30 (approx)
  let sSav = 0;
  if (savingsRate >= 20) sSav = 30;
  else if (savingsRate > 0) sSav = (savingsRate / 20) * 30;
  else sSav = 0; // negative savings = 0 pts

  // Consistency: 100% = 25pts
  let sCons = (consistency / 100) * 25;

  // Volatility: Lower is better. Compared to Avg Income? 
  // If Volatility < 10% of Income -> Good. > 30% -> Bad.
  // Let's normalized: V / AvgInc.
  let sVol = 0;
  if (avgInc > 0) {
      const vRatio = volatility / avgInc;
      // if 0 -> 15pts. If > 0.3 -> 0pts.
      sVol = Math.max(0, 15 * (1 - (vRatio / 0.3)));
  }

  // Fixed Ratio: Target < 50%.
  let sFix = 0;
  if (fixedRatio <= 50) sFix = 15;
  else if (fixedRatio >= 80) sFix = 0;
  else sFix = 15 * ((80 - fixedRatio) / 30);

  // Trend: Slope of accumulation? 
  // Simple: is Net > 0? +5. Is recent net > avg net? +10.
  let sTrend = 0;
  if (avgNet > 0) sTrend += 5;
  if (nets[count-1] > avgNet) sTrend += 10;
  else if (nets[count-1] > 0) sTrend += 5;

  const score = Math.min(100, Math.round(sSav + sCons + sVol + sFix + sTrend));

  // 5. Phrases
  const phrases = [];
  
  // State
  if (savingsRate >= 20) phrases.push({ type: 'good', text: 'Estás a poupar acima do recomendado (>20%). 🚀' });
  else if (savingsRate >= 10) phrases.push({ type: 'warn', text: 'Boa poupança, mas existe margem para crescer. 🌱' });
  else if (savingsRate > 0) phrases.push({ type: 'bad', text: 'Poupança baixa; pequenas fugas fazem diferença. 💧' });
  else phrases.push({ type: 'bad', text: 'Estás a gastar mais do que ganhas. ⚠️' });

  if (consistency < 50) phrases.push({ type: 'bad', text: 'Tens um padrão instável (menos de metade dos meses no verde).' });

  if (fixedRatio > 60) phrases.push({ type: 'warn', text: `As despesas fixas consomem ${fixedRatio.toFixed(0)}% da receita (ideal < 50%).` });

  // Action
  if (avgNet < 0) phrases.push({ type: 'info', text: 'Prioridade: Cortar despesas variáveis supérfluas urgente.' });
  else if (savingsRate < 20) phrases.push({ type: 'info', text: 'Tenta subir a taxa de poupança reforçando o início do mês.' });

  // 6. Chart Series
  const labels = keys.map(k => {
     const [yk, mk] = k.split('-');
     const d = new Date(yk, mk - 1, 1);
     return d.toLocaleDateString('pt-PT', { month: 'short' }); 
  });

  return {
    metrics: { avgNet, savingsRate, fixedRatio, volatility },
    score,
    phrases,
    chart: { labels, nets, cums }
  };
}
