/**
 * scripts/send_daily_report.js
 * Envia notificações Web Push (VAPID) com relatório diário, lendo preferências e subscrições do Supabase.
 */

const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// =========================
// ENV / CONFIG
// =========================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role recomendado
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

// Opcional: ativa logs adicionais
const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";

// Limites de paginação (se tiveres muitos perfis)
const PAGE_SIZE = 1000;

// =========================
// VALIDATION
// =========================
if (!SUPABASE_URL || !SUPABASE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("❌ Missing environment variables");
  console.error("   SUPABASE_URL set:", !!SUPABASE_URL);
  console.error("   SUPABASE_SERVICE_KEY set:", !!SUPABASE_KEY);
  console.error("   VAPID_PUBLIC_KEY set:", !!VAPID_PUBLIC_KEY);
  console.error("   VAPID_PRIVATE_KEY set:", !!VAPID_PRIVATE_KEY);
  process.exit(1);
}

// Debug “seguro”
console.log("🔎 Debug: SUPABASE_URL =", SUPABASE_URL);
console.log("🔎 Debug: SUPABASE_SERVICE_KEY set =", !!SUPABASE_KEY);
console.log("🔎 Debug: VAPID keys set =", !!VAPID_PUBLIC_KEY && !!VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// =========================
// HELPERS
// =========================
const money = (val) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(
    Number(val || 0),
  );

function parseHHMM(str) {
  // "22:00" -> { h: 22, m: 0 }
  if (!str || typeof str !== "string") return null;
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return { h, m: mm };
}

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function isWithinQuietHours(settings) {
  // Interpreta quiet_start/quiet_end em hora do runner (UTC no GitHub Actions).
  // Se quiseres suportar timezone por utilizador, podemos melhorar.
  const qs = parseHHMM(settings?.quiet_start);
  const qe = parseHHMM(settings?.quiet_end);
  if (!qs || !qe) return false;

  const now = new Date();
  const nowMin = minutesOfDay(now);
  const start = qs.h * 60 + qs.m;
  const end = qe.h * 60 + qe.m;

  // Caso típico: 22:00 -> 08:00 (cruza meia-noite)
  if (start > end) {
    return nowMin >= start || nowMin < end;
  }
  // Caso simples: 13:00 -> 16:00
  return nowMin >= start && nowMin < end;
}

function isNotificationsEnabled(settings) {
  // Lógica consistente com o teu modelo:
  // - enabled: true
  // - notifications_enabled: true (se existir)
  // - daily_report: não false (default true)
  // - digest: não false (default true)
  // - respeita quiet hours (se definidos)
  if (!settings || typeof settings !== "object") return false;

  const enabled =
    settings.enabled === true &&
    settings.notifications_enabled !== false && // se existir e for false, bloqueia
    settings.daily_report !== false &&
    settings.digest !== false;

  if (!enabled) return false;

  // Quiet hours: se estiver dentro, não envia (salvo se tiveres uma exceção “urgent”)
  if (settings.urgent === true) return true; // “urgent” pode ignorar quiet hours (se quiseres)
  if (isWithinQuietHours(settings)) return false;

  return true;
}

// =========================
// 1) FETCH USERS ELIGIBLE
// =========================
async function getUsersToNotify() {
  // 1A) Count rápido (para debug)
  const { count: totalCount, error: countError } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error("❌ Count profiles failed:", countError.message);
    throw countError;
  }

  if (DEBUG) {
    console.log("🔎 Debug: profiles total count =", totalCount);
  }

  // 1B) Puxar perfis por páginas
  let all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, notification_settings")
      .not("notification_settings", "is", null)
      .range(from, to);

    if (error) {
      console.error("❌ Fetch profiles failed:", error.message);
      throw error;
    }

    if (!profiles || profiles.length === 0) break;

    all = all.concat(profiles);

    if (profiles.length < PAGE_SIZE) break;
  }

  console.log("🔎 Debug: profiles returned (non-null settings) =", all.length);

  // Filtrar elegíveis
  const eligible = all.filter((p) => isNotificationsEnabled(p.notification_settings));

  if (DEBUG && eligible.length > 0) {
    console.log("🔎 Debug: first eligible id =", eligible[0].id);
    console.log(
      "🔎 Debug: first eligible settings =",
      eligible[0].notification_settings,
    );
  }

  return eligible;
}

// =========================
// 2) GENERATE DAILY REPORT
// =========================
async function generateDailyReport(userId) {
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const startISO = startOfDay.toISOString();
  const endISO = endOfDay.toISOString();

  // Se tiveres RPC, podes usar. Mantive o teu fallback.
  // const { data: output, error } = await supabase.rpc("get_daily_summary", {
  //   p_user_id: userId,
  //   p_date: startISO,
  // });
  // if (!error && output) { ... }

  const { data: txs, error: txError } = await supabase
    .from("transactions")
    .select("amount, type_id, transaction_types(code)")
    .eq("user_id", userId)
    .gte("date", startISO)
    .lte("date", endISO);

  if (txError) throw txError;

  let spent = 0;
  let income = 0;
  let count = 0;

  (txs || []).forEach((t) => {
    const code = t.transaction_types?.code;
    if (code === "EXPENSE") spent += Number(t.amount);
    if (code === "INCOME") income += Number(t.amount);
    count++;
  });

  const { data: accounts, error: accError } = await supabase
    .from("v_account_balances")
    .select("balance")
    .eq("user_id", userId);

  if (accError) throw accError;

  const totalBalance =
    (accounts || []).reduce((acc, curr) => acc + Number(curr.balance), 0) || 0;

  return { spent, income, count, totalBalance };
}

// =========================
// 3) SEND NOTIFICATION(S)
// =========================
async function sendToUser(user) {
  console.log(`👤 User ${user.id}: Preparing report...`);

  const { data: subs, error: subErr } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (subErr) {
    console.error(`❌ User ${user.id}: subscriptions query failed:`, subErr.message);
    return;
  }

  if (!subs || subs.length === 0) {
    console.log(`ℹ️ User ${user.id}: No subscriptions found.`);
    return;
  }

  console.log(`📨 User ${user.id}: ${subs.length} subscription(s) found.`);

  const report = await generateDailyReport(user.id);

  const hour = new Date().getHours();
  const title = hour < 12 ? "Bom dia ☀️" : "Resumo do Dia 🌙";

  let body = `Saldo Atual: ${money(report.totalBalance)}`;

  if (report.count > 0) {
    if (report.spent > 0) body += `\nGastaste ${money(report.spent)} hoje.`;
    if (report.income > 0) body += `\nRecebeste ${money(report.income)}!`;
  } else {
    if (hour >= 18) body += `\nSem movimentos registados hoje.`;
    else body += `\nTem um excelente dia!`;
  }

  // Payload JSON (o teu SW lê JSON e mostra title/body)
  const payload = JSON.stringify({
    title,
    body,
    url: "/#/",          // a tua app usa hash routing
    tag: "daily-report", // substitui notificações anteriores do mesmo tipo
  });

  for (const sub of subs) {
    const pushConfig = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };

    try {
      await webpush.sendNotification(pushConfig, payload);
      console.log(`✅ User ${user.id}: Sent to device ${sub.id.slice(0, 8)}`);
    } catch (err) {
      const status = err?.statusCode;
      console.error(`⚠️ User ${user.id}: Failed to send to ${sub.id.slice(0, 8)} (${status})`);

      // remove subs mortas
      if (status === 410 || status === 404) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        console.log(`🧹 User ${user.id}: Removed dead subscription ${sub.id.slice(0, 8)}`);
      }

      if (DEBUG && err?.body) {
        console.log("🔎 Debug error body:", err.body);
      }
    }
  }
}

// =========================
// MAIN
// =========================
(async () => {
  try {
    console.log("🚀 Starting Daily Report Job...");

    const users = await getUsersToNotify();

    console.log(`Found ${users.length} users with notifications enabled.`);

    for (const user of users) {
      await sendToUser(user);
    }

    console.log("✅ Done.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Fatal Error:", err?.message || err);
    if (DEBUG && err) console.error(err);
    process.exit(1);
  }
})();
