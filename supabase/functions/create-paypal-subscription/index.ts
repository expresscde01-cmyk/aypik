import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const planId = Deno.env.get("PAYPAL_PREMIUM_PLAN_ID");
    const apiBase =
      Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com";

    if (!clientId || !clientSecret || !planId) {
      return json(
        {
          error:
            "PayPal n'est pas configuré (PAYPAL_CLIENT_ID / SECRET / PLAN_ID).",
        },
        503
      );
    }

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

    const body = await req.json().catch(() => ({}));
    const returnUrl =
      body.returnUrl ??
      `${Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:5173"}/?paypal=success`;
    const cancelUrl =
      body.cancelUrl ??
      `${Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:5173"}/?paypal=cancel`;

    const tokenRes = await fetch(`${apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return json({ error: "Auth PayPal échouée", details: tokenData }, 502);
    }

    const subRes = await fetch(`${apiBase}/v1/billing/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: user.id,
        application_context: {
          brand_name: "Aypik",
          locale: "fr-FR",
          shipping_preference: "NO_SHIPPING",
          user_action: "SUBSCRIBE_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
        subscriber: {
          email_address: user.email,
        },
      }),
    });

    const subscription = await subRes.json();
    if (!subRes.ok) {
      return json({ error: "Création abonnement PayPal échouée", details: subscription }, 502);
    }

    const approveLink = (subscription.links || []).find(
      (l: { rel: string }) => l.rel === "approve"
    )?.href;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await admin.from("payment_subscriptions").insert({
      user_id: user.id,
      provider: "paypal",
      provider_subscription_id: subscription.id,
      status: "pending",
      amount_cents: 1999,
      currency: "EUR",
      interval: "month",
    });

    return json({
      subscriptionId: subscription.id,
      approveUrl: approveLink,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur PayPal";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
