import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT");

  const missing = [
    !SUPABASE_URL && "SUPABASE_URL",
    !SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
    !VAPID_PUBLIC_KEY && "VAPID_PUBLIC_KEY",
    !VAPID_PRIVATE_KEY && "VAPID_PRIVATE_KEY",
    !VAPID_SUBJECT && "VAPID_SUBJECT",
  ].filter(Boolean);

  if (missing.length) return json({ error: "Missing env", missing }, 500);

  // ===== DEBUG TEMPORÁRIO (apenas para confirmar secrets no runtime) =====
  return json({
    ok: false,
    debug: {
      vapid_public_prefix: (VAPID_PUBLIC_KEY ?? "").slice(0, 12),
      subject: VAPID_SUBJECT,
      has_private: !!VAPID_PRIVATE_KEY,
    },
  }, 200);
  // ===== FIM DEBUG TEMPORÁRIO =====

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // ok
  }

  const mode = body.mode ?? "custom";
  const user_id: string | undefined = body.user_id;

  let payloadObj: any;

  // ===============================
  // DAILY DIGEST MODE (REAL DATA)
  // ===============================
  if (mode === "daily") {
    if (!user_id) {
      return json({ error: "user_id required for mode=daily" }, 400);
    }

    const { data, error: rpcErr } = await supabase.rpc("get_daily_digest", {
      p_user: user_id,
    });

    if (rpcErr) {
      return json({ error: "RPC error", details: rpcErr.message }, 500);
    }

    const balance = Number(data?.balance ?? 0);
    const spentToday = Number(data?.spent_today ?? 0);
    const next = data?.next_fixed ?? null;

    // next_fixed agora vem do v_regularities_expenses:
    // { regularity: string, total: numeric, month: date }
    const nextTxt = next?.regularity
      ? `${next.regularity} (€${Number(next.total ?? 0).toFixed(2)} este mês)`
      : "—";

    payloadObj = {
      title: "WiseBudget — Relatório diário",
      body: `Saldo: €${balance.toFixed(2)} | Gastos hoje: €${spentToday.toFixed(
        2
      )} | Fixos do mês: ${nextTxt}`,
      url: body.url ?? "/#/dashboard",
      tag: "daily-digest",
    };
  } else {
    // ===============================
    // CUSTOM MODE
    // ===============================
    payloadObj = {
      title: body.title ?? "WiseBudget",
      body: body.body ?? "Notificação de teste",
      url: body.url ?? "/",
      tag: body.tag ?? "test",
    };
  }

  const payload = JSON.stringify(payloadObj);

  webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);

  // Buscar subscriptions
  const query = supabase
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth");

  if (user_id) query.eq("user_id", user_id);

  const { data: subs, error } = await query;

  if (error) return json({ error: "DB error", details: error.message }, 500);

  if (!subs?.length)
    return json({ ok: true, sent: 0, message: "No subscriptions found" }, 200);

  let sent = 0;
  let removed = 0;
  const failures: Array<{ id: string; reason: string; statusCode?: number }> =
    [];

  for (const s of subs) {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    };

    try {
      await webpush.sendNotification(subscription as any, payload);
      sent++;
    } catch (err: any) {
      const statusCode = err?.statusCode ?? err?.status ?? undefined;

      // 404/410 = subscription morta -> limpar
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
        removed++;
      } else {
        failures.push({
          id: s.id,
          reason: err?.message ?? "push failed",
          statusCode,
        });
      }
    }
  }

  return json({ ok: true, sent, removed, failures }, 200);
});
