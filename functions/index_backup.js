const functions = require("firebase-functions");
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
 * Scheduled Function: Daily at 9:00 AM Lisbon time (v1)
 */
exports.sendDailyNotification = functions.pubsub
  .schedule("0 9 * * *")
  .timeZone("Europe/Lisbon")
  .onRun(async (context) => {
    logger.info("Starting daily notification job (v1)...");

    try {
      // 1. Fetch subscriptions
      const { data: subs, error } = await sb
        .from("push_subscriptions")
        .select("*");

      if (error) {
        logger.error("Supabase Error:", error);
        return null;
      }

      if (!subs || subs.length === 0) {
        logger.info("No subscriptions found.");
        return null;
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
    return null;
  });

/**
 * HTTP Function for testing manually (v1)
 */
exports.testNotification = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const { data: subs } = await sb.from("push_subscriptions").select("*");
      if (!subs?.length) return res.send("No subscriptions.");

      // Send to first for test
      const sub = subs[0];
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      const payload = JSON.stringify({
        title: "Teste de Notificação",
        body: "Se estás a ver isto, o sistema funciona! (v1/v79)",
        icon: "/icon-192.png",
      });

      await webpush.sendNotification(pushConfig, payload);
      res.send(`Sent test to 1 device (of ${subs.length}).`);
    } catch (e) {
      logger.error(e);
      res.status(500).send(e.toString());
    }
  });
});
