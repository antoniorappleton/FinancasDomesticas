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
    logger.info("Starting daily notification job (v2)...");

    try {
      // 1. Fetch subscriptions
      const { data: subs, error } = await sb
        .from("push_subscriptions")
        .select("*");

      if (error) {
        logger.error("Supabase Error:", error);
        return;
      }

      if (!subs || subs.length === 0) {
        logger.info("No subscriptions found.");
        return;
      }

      logger.info(`Found ${subs.length} subscriptions.`);

      // 2. Prepare payload
      const payload = JSON.stringify({
        title: "Resumo Diário",
        body: "Abre a app para veres o teu resumo financeiro de hoje!",
        icon: "https://wisebudget-financaspessoais.web.app/icon-192.png",
        badge: "https://wisebudget-financaspessoais.web.app/icon-192.png",
        url: "https://wisebudget-financaspessoais.web.app/#/",
      });

      // 3. Send to all
      const promises = subs.map(async (sub) => {
        const pushConfig = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(pushConfig, payload);
          return { success: true };
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            logger.info(
              `Subscription expired for ${sub.endpoint}, deleting...`,
            );
            await sb
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          } else {
            logger.error("Error sending push:", err);
          }
          return { success: false, err };
        }
      });

      await Promise.all(promises);
      logger.info("Daily notifications sent.");
    } catch (err) {
      logger.error("Fatal error in daily job:", err);
    }
  },
);

/**
 * Scheduled Function: Weekly at 9:00 AM Lisbon time (Mondays) (v2)
 */
exports.sendWeeklyNotification = onSchedule(
  { schedule: "0 9 * * 1", timeZone: "Europe/Lisbon" },
  async (event) => {
    logger.info("Starting weekly notification job...");

    try {
      const { data: subs, error } = await sb
        .from("push_subscriptions")
        .select("*");

      if (error) {
        logger.error("Supabase Error:", error);
        return;
      }

      if (!subs || subs.length === 0) {
        logger.info("No subscriptions found.");
        return;
      }

      const payload = JSON.stringify({
        title: "Resumo Semanal",
        body: "O teu relatório financeiro da semana já está disponível.",
        icon: "https://wisebudget-financaspessoais.web.app/icon-192.png",
        badge: "https://wisebudget-financaspessoais.web.app/icon-192.png",
        url: "https://wisebudget-financaspessoais.web.app/#/",
      });

      const promises = subs.map(async (sub) => {
        const pushConfig = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(pushConfig, payload);
          return { success: true };
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await sb
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          }
          return { success: false, err };
        }
      });

      await Promise.all(promises);
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
