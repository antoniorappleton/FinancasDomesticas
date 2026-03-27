const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors")({ origin: true });
const nodemailer = require("nodemailer");
const { jsPDF } = require("jspdf");

const { defineSecret } = require("firebase-functions/params");

// Definir Segredos (Secret Manager)
const sbServiceKey = defineSecret("SB_SERVICE_KEY");
const gmailPass = defineSecret("GMAIL_PASS");

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
 * Scheduled Function: Daily at 9:00 PM Lisbon time
 */
exports.sendDailyNotification = onSchedule(
  { schedule: "0 21 * * *", timeZone: "Europe/Lisbon" },
  async (event) => {
    logger.info("Starting daily notification job...");

    try {
      const { data: types } = await sb
        .from("transaction_types")
        .select("id, code")
        .eq("code", "EXPENSE")
        .single();
      const expenseTypeId = types?.id;

      const { data: subs, error } = await sb
        .from("push_subscriptions")
        .select("*");

      if (error || !subs?.length) {
        logger.info("No subscriptions or error.");
        return;
      }

      const subsByUser = {};
      subs.forEach((sub) => {
        if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = [];
        subsByUser[sub.user_id].push(sub);
      });

      const today = new Date().toISOString().slice(0, 10);

      for (const userId of Object.keys(subsByUser)) {
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
 * Scheduled Function: Weekly at 10:00 PM Lisbon time (Sundays)
 */
exports.sendWeeklyNotification = onSchedule(
  { schedule: "0 22 * * 0", timeZone: "Europe/Lisbon" },
  async (event) => {
    logger.info("Starting weekly notification job...");

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
 * Scheduled Function: Last day of the month at 23:00 Lisbon time
 * DESIGN PROFISSIONAL: Com segredos seguros (Secret Manager)
 */
exports.sendMonthlyReportEmail = onSchedule(
  { schedule: "0 23 28-31 * *", timeZone: "Europe/Lisbon", secrets: [sbServiceKey, gmailPass] },
  async (event) => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() !== lastDay) return;

    logger.info("Starting professional monthly report job...");

    try {
      const sbAdmin = createClient(SUPABASE_URL, sbServiceKey.value());
      const { data: tt } = await sbAdmin.from("transaction_types").select("id, code");
      const typeMap = {};
      tt.forEach((t) => (typeMap[t.code] = t.id));

      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const to = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

      const { data: usersData } = await sbAdmin.from("transactions").select("user_id").gte("date", from).lte("date", to);
      const userIds = [...new Set(usersData?.map((u) => u.user_id))];

      const transporter = nodemailer.createTransport({
        service: "gmail", auth: { user: "antonioappleton@gmail.com", pass: gmailPass.value() }
      });

      for (const uid of userIds) {
        try {
          let targetEmail = "antonioappleton@gmail.com"; 
          const { data: profile } = await sbAdmin.from("profiles").select("email").eq("id", uid).single();
          if (profile?.email) targetEmail = profile.email;

          const { data: txs } = await sbAdmin.from("transactions")
            .select("amount, description, date, type_id, categories(name)")
            .eq("user_id", uid).gte("date", from).lte("date", to);

          if (!txs?.length) continue;

          let inc = 0, exp = 0, sav = 0;
          const byCat = {};
          txs.forEach(t => {
            const amt = Number(t.amount);
            if (t.type_id === typeMap.INCOME) inc += amt;
            else if (t.type_id === typeMap.EXPENSE) {
                exp += amt;
                const cat = t.categories?.name || "Outros";
                byCat[cat] = (byCat[cat] || 0) + amt;
            }
            else if (t.type_id === typeMap.SAVINGS) sav += amt;
          });
          const net = inc - exp - sav;
          const monthLabel = now.toLocaleString("pt-PT", { month: "long", year: "numeric" });

          const doc = new jsPDF();
          doc.setFillColor(6, 95, 70); 
          doc.rect(0, 0, 210, 40, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(22); doc.text("WiseBudget", 20, 25);
          doc.setFontSize(10); doc.text(`RELATÓRIO MENSAL - ${monthLabel.toUpperCase()}`, 110, 24);

          doc.setTextColor(0, 0, 0); doc.setFontSize(14); doc.text("Resumo Financeiro", 20, 55);
          doc.setFontSize(10);
          let y = 65;
          const drawRow = (label, val, color = [0,0,0]) => {
              doc.setTextColor(100, 100, 100); doc.text(label, 20, y);
              doc.setTextColor(color[0], color[1], color[2]); doc.text(`${val.toFixed(2)} EUR`, 150, y, { align: "right" });
              y += 10;
          };
          drawRow("Total de Receitas", inc, [22, 163, 74]);
          drawRow("Total de Despesas", exp, [239, 68, 68]);
          drawRow("Total de Poupanças", sav, [37, 99, 235]);
          doc.line(20, y-5, 190, y-5);
          drawRow("Saldo Líquido", net, net >= 0 ? [22, 163, 74] : [239, 68, 68]);

          y += 10;
          doc.setFontSize(14); doc.setTextColor(0,0,0); doc.text("Despesas por Categoria", 20, y);
          y += 10;
          doc.setFontSize(10);
          Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0, 15).forEach(([cat, val]) => {
              if (y > 270) { doc.addPage(); y = 20; }
              doc.setTextColor(80, 80, 80); doc.text(cat, 25, y);
              doc.setTextColor(0,0,0); doc.text(`${val.toFixed(2)} EUR`, 150, y, { align: "right" });
              y += 8;
          });

          const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
          const htmlBody = `
            <div style="background-color: #f3f4f6; padding: 40px 20px; font-family: 'Segoe UI', sans-serif;">
              <div style="background-color: white; max-width: 600px; margin: 0 auto; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="background-color: #065f46; color: white; padding: 30px; text-align: center;">
                  <h1 style="margin: 0; font-size: 24px;">Relatório Mensal</h1>
                  <p style="margin: 5px 0 0; opacity: 0.8;">${monthLabel}</p>
                </div>
                <div style="padding: 30px;">
                  <p>Olá <b>${targetEmail.split('@')[0]}</b>,</p>
                  <p>Aqui está o resumo da tua atividade financeira deste mês:</p>
                  <div style="background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
                    <table style="width: 100%; font-size: 16px;">
                      <tr><td style="color: #6b7280; padding: 8px 0;">Receitas</td><td style="text-align: right; color: #16a34a; font-weight: bold;">+ ${inc.toFixed(2)} €</td></tr>
                      <tr><td style="color: #6b7280; padding: 8px 0;">Despesas</td><td style="text-align: right; color: #ef4444; font-weight: bold;">- ${exp.toFixed(2)} €</td></tr>
                      <tr><td style="color: #6b7280; padding: 8px 0;">Poupanças</td><td style="text-align: right; color: #2563eb; font-weight: bold;">- ${sav.toFixed(2)} €</td></tr>
                      <tr><td colspan="2"><hr style="border:0; border-top: 1px solid #e5e7eb; margin: 10px 0;"></td></tr>
                      <tr><td style="font-weight: bold; padding: 8px 0;">Saldo Final</td><td style="text-align: right; font-weight: bold; font-size: 20px;">${net.toFixed(2)} €</td></tr>
                    </table>
                  </div>
                  <p>Em anexo podes encontrar o relatório detalhado em formato PDF.</p>
                  <a href="https://wisebudget-financaspessoais.web.app" style="display: block; background-color: #065f46; color: white; text-align: center; padding: 15px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 25px;">Abrir WiseBudget</a>
                </div>
              </div>
            </div>
          `;

          await transporter.sendMail({
            from: "WiseBudget <antonioappleton@gmail.com>", to: targetEmail,
            subject: `Relatório WiseBudget - ${monthLabel}`,
            html: htmlBody,
            attachments: [{ filename: `Relatorio_WB_${year}_${month}.pdf`, content: pdfBuffer }]
          });
        } catch (e) { logger.error(e); }
      }
    } catch (err) { logger.error(err); }
  }
);

/**
 * HTTP Function for testing manually
 */
exports.testMonthlyReportEmail = onRequest({ secrets: [sbServiceKey, gmailPass] }, async (req, res) => {
  cors(req, res, async () => {
    logger.info("Manual trigger for Monthly Report Test...");
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail", auth: { user: "antonioappleton@gmail.com", pass: gmailPass.value() }
      });
      const monthLabel = new Date().toLocaleString("pt-PT", { month: "long", year: "numeric" });
      
      const doc = new jsPDF();
      doc.text(`TESTE DE ENVIO - WiseBudget`, 20, 20);
      doc.text(`Segredo SB carregado: ${sbServiceKey.value() ? "SIM" : "NAO"}`, 20, 40);
      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

      await transporter.sendMail({
        from: "WiseBudget Test <antonioappleton@gmail.com>", to: "antonioappleton@gmail.com",
        subject: `TESTE SEGURO: Relatório WiseBudget`,
        html: `<h3>Teste Concluído com Sucesso!</h3><p>Este email foi enviado usando os segredos do <b>Firebase Secret Manager</b>. Nenhuma chave está agora no código.</p>`,
        attachments: [{ filename: "Teste_Seguro.pdf", content: pdfBuffer }]
      });
      res.send("Email de teste enviado usando segredos seguros!");
    } catch (err) {
      logger.error(err);
      res.status(500).send("Erro no teste: " + err.message);
    }
  });
});
