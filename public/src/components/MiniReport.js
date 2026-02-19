import { money } from "../lib/helpers.js";

export const MiniReport = {
  LS_KEY_LAST: "wb:report:lastShown",
  LS_KEY_ENABLED: "wb:settings:dailyReport",

  async checkAndShow() {
    // 1. Check settings
    const enabled = localStorage.getItem(this.LS_KEY_ENABLED) !== "false"; // Default true
    if (!enabled) return;

    // 2. Check frequency (once per day)
    const last = localStorage.getItem(this.LS_KEY_LAST);
    const today = new Date().toISOString().slice(0, 10);
    if (last === today) return;

    // 3. Prepare UI & Data
    try {
      const data = await this.fetchMetrics();
      this.render(data);
      localStorage.setItem(this.LS_KEY_LAST, today);
    } catch (e) {
      console.warn("MiniReport failed:", e);
    }
  },

  async fetchMetrics() {
    const sb = window.sb;
    if (!sb) throw new Error("Supabase not ready");

    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);

    // Helper to get start/end dates
    const getRange = (type, offset = 0) => {
      const d = new Date();
      if (type === "week") {
        const day = d.getDay() || 7; // 1=Mon, 7=Sun
        if (day !== 1) d.setHours(-24 * (day - 1));
        d.setHours(0, 0, 0, 0);
        // offset weeks
        d.setDate(d.getDate() - 7 * offset);
        const start = d.toISOString();
        const endD = new Date(d);
        endD.setDate(endD.getDate() + 6);
        endD.setHours(23, 59, 59, 999);
        return { start, end: endD.toISOString() };
      }
      if (type === "month") {
        d.setDate(1);
        d.setMonth(d.getMonth() - offset);
        d.setHours(0, 0, 0, 0);
        const start = d.toISOString();
        const endD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        endD.setHours(23, 59, 59, 999);
        return { start, end: endD.toISOString() };
      }
      // Day
      const d2 = new Date();
      d2.setHours(0, 0, 0, 0);
      return { start: d2.toISOString(), end: new Date().toISOString() };
    };

    const rDay = getRange("day");
    const rWeek = getRange("week");
    const rLastWeek = getRange("week", 1);
    const rMonth = getRange("month");
    const rLastMonth = getRange("month", 1);

    // Fetch sums in parallel
    // We only care about EXPENSES (type_id usually... need to find it or join)
    // For speed, let's assume we can sum positive amounts for expenses?
    // Or better, fetch transaction_types first.

    const { data: ttype } = await sb
      .from("transaction_types")
      .select("id")
      .eq("code", "EXPENSE")
      .single();
    const expId = ttype?.id;

    const sumRange = async (start, end) => {
      const { data, error } = await sb
        .from("transactions")
        .select("amount")
        .eq("type_id", expId)
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;
      return data.reduce((acc, r) => acc + Number(r.amount), 0);
    };

    const [todaySum, weekSum, lastWeekSum, monthSum, lastMonthSum] =
      await Promise.all([
        sumRange(rDay.start, rDay.end),
        sumRange(rWeek.start, rWeek.end),
        sumRange(rLastWeek.start, rLastWeek.end),
        sumRange(rMonth.start, rMonth.end),
        sumRange(rLastMonth.start, rLastMonth.end),
      ]);

    const pct = (curr, prev) => {
      if (!prev) return curr ? "+100%" : "0%";
      const diff = ((curr - prev) / prev) * 100;
      return (diff > 0 ? "+" : "") + diff.toFixed(0) + "%";
    };

    return {
      today: todaySum,
      week: weekSum,
      weekPct: pct(weekSum, lastWeekSum),
      month: monthSum,
      monthPct: pct(monthSum, lastMonthSum),
    };
  },

  render(metrics) {
    const existing = document.getElementById("mini-report-modal");
    if (existing) existing.remove();

    const html = `
      <div class="mini-report-backdrop"></div>
      <div class="mini-report-card">
        <div class="mr-header">
          <h3>Resumo Financeiro</h3>
          <button class="mr-close">×</button>
        </div>
        <div class="mr-body">
          <div class="mr-row">
            <span class="mr-label">Hoje</span>
            <span class="mr-val highlight">${money(metrics.today)}</span>
          </div>
          <div class="mr-row">
            <span class="mr-label">Esta Semana</span>
            <div class="mr-group">
              <span class="mr-val">${money(metrics.week)}</span>
              <span class="mr-badge ${metrics.weekPct.includes("+") ? "bad" : "good"}">${metrics.weekPct}</span>
            </div>
          </div>
          <div class="mr-row">
            <span class="mr-label">Este Mês</span>
            <div class="mr-group">
              <span class="mr-val">${money(metrics.month)}</span>
              <span class="mr-badge ${metrics.monthPct.includes("+") ? "bad" : "good"}">${metrics.monthPct}</span>
            </div>
          </div>
        </div>
        <div class="mr-footer">
          <button class="mr-btn-close">Fechar</button>
        </div>
      </div>
    `;

    const div = document.createElement("div");
    div.id = "mini-report-modal";
    div.className = "mini-report-wrapper";
    div.innerHTML = html;
    document.body.appendChild(div);

    // Animation entry
    requestAnimationFrame(() => div.classList.add("is-visible"));

    // Handlers
    const close = () => {
      div.classList.remove("is-visible");
      setTimeout(() => div.remove(), 300);
    };

    div.querySelector(".mr-close").onclick = close;
    div.querySelector(".mr-btn-close").onclick = close;
    div.querySelector(".mini-report-backdrop").onclick = close;
  },
};
