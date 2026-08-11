import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Session invalide" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: subs } = await admin
      .from("payment_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due", "incomplete", "pending"])
      .order("created_at", { ascending: false });

    for (const sub of subs || []) {
      if (sub.provider === "stripe" && sub.provider_subscription_id) {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (stripeKey) {
          const stripe = new Stripe(stripeKey, {
            apiVersion: "2024-11-20.acacia",
          });
          await stripe.subscriptions.update(sub.provider_subscription_id, {
            cancel_at_period_end: true,
          });
        }
      }

      if (sub.provider === "paypal" && sub.provider_subscription_id) {
        const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
        const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
        const apiBase =
          Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com";
        if (clientId && clientSecret) {
          const tokenRes = await fetch(`${apiBase}/v1/oauth2/token`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
          });
          const tokenData = await tokenRes.json();
          if (tokenRes.ok) {
            await fetch(
              `${apiBase}/v1/billing/subscriptions/${sub.provider_subscription_id}/cancel`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${tokenData.access_token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  reason: "Résiliation demandée par l'utilisateur",
                }),
              }
            );
          }
        }
      }
    }

    await admin.rpc("cancel_paid_premium", { p_user_id: user.id });

    return json({
      ok: true,
      message:
        "Abonnement résilié. L'accès Premium reste actif jusqu'à la fin de la période déjà payée si applicable.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur résiliation";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
