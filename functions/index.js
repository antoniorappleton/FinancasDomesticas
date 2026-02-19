const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors")({ origin: true });

// Configurar VAPID
const vapidKeys = {
  publicKey:
    "BH0rnMSjXoeBnrHJiQu1TXI4RS8GTIhLsOPhyp0Dnc2tQBstlJu91opBmPQXtdEFrEwGE_jrVcy2CyQ0XhuLOL4",
  privateKey: "-VkqxQKEaSZY5zUXV4DsmwAOTMdPFLq5h2ov5ALeU7w",
};

webpush.setVapidDetails(
  "mailto:ap@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey,
);

const SUPABASE_URL = "https://brakxcumzdleufrpyipm.supabase.co";
const ANAON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyYWt4Y3VtemRsZXVmcnB5aXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MTI1MzMsImV4cCI6MjA3NDE4ODUzM30.Y-zw1H1gTyJnFJ3lxbamY8hU1KOFG06ayLmXYMuVknA";

const sb = createClient(SUPABASE_URL, ANAON_KEY);

/**
 * Scheduled Function: Daily at 9:00 AM Lisbon time (v2)
 */
exports.sendDailyNotification = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Europe/Lisbon" },
  async (event) => {
    logger.info("Starting daily notification job (Rich v1)...");

    try {
      // 1. Get Expense Type ID
      const { data: types } = await sb
        .from("transaction_types")
        .select("id, code")
        .eq("code", "EXPENSE")
        .single();
      const expenseTypeId = types?.id;

      // 2. Fetch subscriptions
      const { data: subs, error } = await sb
        .from("push_subscriptions")
        .select("*");

      if (error || !subs?.length) {
        logger.info("No subscriptions or error.");
        return;
      }

      // 3. Group by User ID to batch DB queries
      const subsByUser = {};
      subs.forEach((sub) => {
        if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = [];
        subsByUser[sub.user_id].push(sub);
      });

      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      // 4. Process each user
      for (const userId of Object.keys(subsByUser)) {
        // Fetch daily expenses
        let bodyText = "Abre a app para veres o teu resumo financeiro.";
        if (expenseTypeId) {
          const { data: txs } = await sb
            .from("transactions")
            .select("amount")
            .eq("user_id", userId)
            .eq("date", today)
            .eq("type_id", expenseTypeId);

          if (txs && txs.length > 0) {
            const total = txs.reduce((sum, t) => sum + Number(t.amount), 0);
            const formatter = new Intl.NumberFormat("pt-PT", {
              style: "currency",
              currency: "EUR",
            });
            bodyText = `Gasto hoje: ${formatter.format(total)}`;
          } else {
            bodyText = "Sem despesas registadas hoje. Bom trabalho!";
          }
        }

        const payload = JSON.stringify({
          title: "Resumo Diário",
          body: bodyText,
          icon: "https://wisebudget-financaspessoais.web.app/icon-192.png",
          badge: "https://wisebudget-financaspessoais.web.app/icon-192.png",
          url: "https://wisebudget-financaspessoais.web.app/#/transactions?report=daily",
        });

        // Send to all devices of this user
        const userSubs = subsByUser[userId];
        await Promise.all(
          userSubs.map(async (sub) => {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth },
                },
                payload
              );
            } catch (err) {
              if (err.statusCode === 410 || err.statusCode === 404) {
                await sb
                  .from("push_subscriptions")
                  .delete()
                  .eq("endpoint", sub.endpoint);
              }
            }
          })
        );
      }
      logger.info(`Processed daily notifications for ${Object.keys(subsByUser).length} users.`);
    } catch (err) {
      logger.error("Fatal error in daily job:", err);
    }
  }
);

/**
 * Scheduled Function: Weekly at 9:00 AM Lisbon time (Mondays) (v2)
 */
exports.sendWeeklyNotification = onSchedule(
  { schedule: "0 9 * * 1", timeZone: "Europe/Lisbon" },
  async (event) => {
    logger.info("Starting weekly notification job (Rich v1)...");

    try {
      const { data: types } = await sb
        .from("transaction_types")
        .select("id, code")
        .eq("code", "EXPENSE")
        .single();
      const expenseTypeId = types?.id;

      const { data: subs, error } = await sb.from("push_subscriptions").select("*");
      if (error || !subs?.length) return;

      const subsByUser = {};
      subs.forEach((sub) => {
        if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = [];
        subsByUser[sub.user_id].push(sub);
      });

      // Calculate last 7 days
      const today = new Date();
      const lastWeek = new Date(today);
      lastWeek.setDate(today.getDate() - 7);
      const fromDate = lastWeek.toISOString().slice(0, 10);
      const toDate = today.toISOString().slice(0, 10);

      for (const userId of Object.keys(subsByUser)) {
        let bodyText = "O teu relatório financeiro da semana já está disponível.";
        
        if (expenseTypeId) {
          const { data: txs } = await sb
            .from("transactions")
            .select("amount")
            .eq("user_id", userId)
            .gte("date", fromDate)
            .lte("date", toDate)
            .eq("type_id", expenseTypeId);

          if (txs && txs.length > 0) {
            const total = txs.reduce((sum, t) => sum + Number(t.amount), 0);
            const formatter = new Intl.NumberFormat("pt-PT", {
              style: "currency",
              currency: "EUR",
            });
            bodyText = `Total gasto esta semana: ${formatter.format(total)}`;
          } else {
             bodyText = "Sem despesas registadas esta semana.";
          }
        }

        const payload = JSON.stringify({
          title: "Resumo Semanal",
          body: bodyText,
          icon: "https://wisebudget-financaspessoais.web.app/icon-192.png",
          badge: "https://wisebudget-financaspessoais.web.app/icon-192.png",
          url: "https://wisebudget-financaspessoais.web.app/#/transactions?report=weekly",
        });

        const userSubs = subsByUser[userId];
        await Promise.all(
          userSubs.map(async (sub) => {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload
              );
            } catch (err) {
              if (err.statusCode === 410 || err.statusCode === 404) {
                await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
              }
            }
          })
        );
      }
      logger.info("Weekly notifications sent.");
    } catch (err) {
      logger.error("Fatal error in weekly job:", err);
    }
  },
);

/**
 * HTTP Function for testing manually (v2)
 */
exports.testNotification = onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const { data: subs } = await sb.from("push_subscriptions").select("*");
      if (!subs?.length) return res.send("No subscriptions found.");

      const results = [];
      const payload = JSON.stringify({
        title: "Resumo Diário",
        body: "Abre a app para veres o teu resumo financeiro de hoje!",
        icon: "https://wisebudget-financaspessoais.web.app/icon-192.png",
        badge: "https://wisebudget-financaspessoais.web.app/icon-192.png",
        url: "https://wisebudget-financaspessoais.web.app/#/",
      });

      // Send to ALL subscriptions to ensure we hit the valid one and clean others
      for (const sub of subs) {
        const pushConfig = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          await webpush.sendNotification(pushConfig, payload);
          results.push({ endpoint: sub.endpoint, status: "sent" });
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await sb
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
            results.push({ endpoint: sub.endpoint, status: "deleted (410)" });
          } else {
            results.push({ endpoint: sub.endpoint, error: err.message });
          }
        }
      }

      res.send({ summary: `Processed ${subs.length} subs`, results });
    } catch (e) {
      logger.error(e);
      res.status(500).send(e.toString());
    }
  });
});

/**
 * DEBUG: Run every minute to test connectivity
 */
exports.debugTicker = onSchedule(
  { schedule: "* * * * *", timeZone: "Europe/Lisbon" },
  async (event) => {
    logger.info("DEBUG TICKER: Starting Rich...");
    
    // 1. Get Expense Type ID
    const { data: types } = await sb
      .from("transaction_types")
      .select("id, code")
      .eq("code", "EXPENSE")
      .single();
    const expenseTypeId = types?.id;

    const { data: subs } = await sb.from("push_subscriptions").select("*");
    if (!subs?.length) return;

    const subsByUser = {};
    subs.forEach((sub) => {
      if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = [];
      subsByUser[sub.user_id].push(sub);
    });

    const isEven = new Date().getMinutes() % 2 === 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const userId of Object.keys(subsByUser)) {
      let bodyText = "Abre a app para veres o teu resumo.";
      
      if (expenseTypeId) {
        const { data: txs } = await sb
          .from("transactions")
          .select("amount, description")
          .eq("user_id", userId)
          .eq("date", today)
          .eq("type_id", expenseTypeId)
          .order("amount", { ascending: false })
          .limit(3);

        if (txs && txs.length > 0) {
          // Calculate total from ALL transactions (need separate query or aggregate)
          // For efficiency in this ticker, let's just sum these or fetch total separately.
          // Let's fetch total separately to be accurate.
           const { data: allTxs } = await sb
            .from("transactions")
            .select("amount")
            .eq("user_id", userId)
            .eq("date", today)
            .eq("type_id", expenseTypeId);
            
          const total = (allTxs || []).reduce((sum, t) => sum + Number(t.amount), 0);
          
          const formatter = new Intl.NumberFormat("pt-PT", {
            style: "currency",
            currency: "EUR",
          });
          
          const details = txs.map(t => `${t.description} (${Number(t.amount).toFixed(0)}€)`).join(", ");
          
          bodyText = isEven 
            ? `Hoje: ${formatter.format(total)} (${details}...)`
            : `Resumo: ${formatter.format(total)} total.`;
        } else {
          bodyText = "(Teste) Sem despesas hoje.";
        }
      }

      const payload = JSON.stringify({
        title: isEven ? "Resumo Diário (Rich)" : "Resumo Semanal (Rich)",
        body: bodyText,
        icon: "https://wisebudget-financaspessoais.web.app/icon-192.png",
        badge: "https://wisebudget-financaspessoais.web.app/icon-192.png",
        url: isEven
          ? "https://wisebudget-financaspessoais.web.app/#/transactions?report=daily"
          : "https://wisebudget-financaspessoais.web.app/#/transactions?report=weekly",
      });

      const userSubs = subsByUser[userId];
      await Promise.all(
        userSubs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            );
            logger.info(`DEBUG: Sent to ${sub.endpoint.slice(0, 20)}...`);
          } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
               await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            }
          }
        })
      );
    }
  }
);
