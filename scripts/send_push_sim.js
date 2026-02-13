const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// 1. Carregar Configs
const keys = JSON.parse(fs.readFileSync('keys.json', 'utf8'));
const supabaseUrl = "https://brakxcumzdleufrpyipm.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyYWt4Y3VtemRsZXVmcnB5aXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MTI1MzMsImV4cCI6MjA3NDE4ODUzM30.Y-zw1H1gTyJnFJ3lxbamY8hU1KOFG06ayLmXYMuVknA"; // ANON_KEY

const sb = createClient(supabaseUrl, supabaseKey);

webpush.setVapidDetails(
  'mailto:antonioappleton@gmail.com',
  keys.publicKey,
  keys.privateKey
);

async function sendOfficialTest() {
  console.log("--- WiseBudget Push Simulator ---");

  // Verificar se foram passados argumentos manuais
  const [,, manualEndpoint, manualP256dh, manualAuth] = process.argv;

  let pushSubscription;

  if (manualEndpoint && manualP256dh && manualAuth) {
    console.log("Utilizando dados manuais passados via terminal...");
    pushSubscription = {
      endpoint: manualEndpoint,
      keys: {
        p256dh: manualP256dh,
        auth: manualAuth
      }
    };
  } else {
    console.log("Buscando subscrição na base de dados (Supabase)...");
    const { data, error } = await sb
      .from('push_subscriptions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      console.error("\n❌ Erro: Nenhuma subscrição encontrada ou acesso negado (RLS).");
      console.log("\nCOMO RESOLVER:");
      console.log("1. No browser, abre a consola (F12) e escreve:");
      console.log("   const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();");
      console.log("   console.log(JSON.stringify(sub.toJSON(), null, 2));");
      console.log("\n2. Depois corre o script assim:");
      console.log("   node scripts/send_push_sim.js \"ENDPOINT\" \"P256DH\" \"AUTH\"");
      return;
    }

    const sub = data[0];
    console.log(`Enviando para o dispositivo: ${sub.user_agent || 'Desconhecido'}`);

    pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };
  }

  const payload = JSON.stringify({
    title: "WiseBudget Premium",
    body: "Esta é uma notificação OFICIAL enviada via Servidor! 🚀",
    url: "/#dashboard"
  });

  try {
    await webpush.sendNotification(pushSubscription, payload);
    console.log("\n✅ Sucesso! A notificação foi enviada para o gateway de push.");
  } catch (err) {
    console.error("\n❌ Erro ao enviar push:", err);
  }
}

sendOfficialTest();
