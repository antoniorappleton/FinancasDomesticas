const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

if (!SUPABASE_URL || !SUPABASE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

/**
 * Helper: Format currency
 */
const money = (val) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(
    val,
  );

/**
 * 1. Fetch Users with Notifications Enabled
 */
async function getUsersToNotify() {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, notification_settings")
    .not("notification_settings", "is", null);

  if (error) throw error;

  // Filter only those who want 'digest' (daily wrapper)
  return profiles.filter((p) => p.notification_settings.digest !== false);
}

/**
 * 2. Generate Report Data for User
 */
async function generateDailyReport(userId) {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

  // Transaction Summary for Today
  const { data: output, error } = await supabase.rpc("get_daily_summary", {
    p_user_id: userId,
    p_date: startOfDay,
  });

  // Note: If RPC doesn't exist yet, we can fetch raw transactions
  // Fallback to raw query for now until RPC is created
  const { data: txs, error: txError } = await supabase
    .from("transactions")
    .select("amount, type_id, transaction_types(code)")
    .eq("user_id", userId)
    .gte("date", startOfDay)
    .lte("date", endOfDay);

  if (txError) throw txError;

  let spent = 0;
  let income = 0;
  let count = 0;

  txs.forEach((t) => {
    const code = t.transaction_types?.code;
    if (code === "EXPENSE") spent += Number(t.amount);
    if (code === "INCOME") income += Number(t.amount);
    count++;
  });

  // Fetch Balance (Total)
  const { data: accounts } = await supabase
    .from("v_account_balances")
    .select("balance")
    .eq("user_id", userId);

  const totalBalance =
    accounts?.reduce((acc, curr) => acc + Number(curr.balance), 0) || 0;

  return {
    spent,
    income,
    count,
    totalBalance,
  };
}

/**
 * 3. Send Notification to User
 */
async function sendToUser(user) {
  console.log(`User ${user.id}: Preparing report...`);

  // Get Subscriptions
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", user.id);

  if (!subs || subs.length === 0) {
    console.log(`User ${user.id}: No subscriptions found.`);
    return;
  }

  // Generate Data
  const report = await generateDailyReport(user.id);

  // Time-based Title
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

  const payload = JSON.stringify({
    title,
    body,
    url: "/#/", // Open dashboard
    tag: "daily-report", // Replaces previous report if any
  });

  // Send to all devices
  for (const sub of subs) {
    const pushConfig = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };

    try {
      await webpush.sendNotification(pushConfig, payload);
      console.log(`User ${user.id}: Sent to device ${sub.id.slice(0, 8)}`);
    } catch (err) {
      console.error(`User ${user.id}: Failed to send (${err.statusCode})`);
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Remove dead subscription
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        console.log(`User ${user.id}: Removed dead subscription ${sub.id}`);
      }
    }
  }
}

/**
 * Main
 */
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
    console.error("❌ Fatal Error:", err);
    process.exit(1);
  }
})();
