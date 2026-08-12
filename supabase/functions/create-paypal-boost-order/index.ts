import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BOOST_AMOUNT = "2.99";

async function paypalAccessToken() {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  const base =
    Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com";
  if (!clientId || !secret) {
    throw new Error("PayPal non configuré (CLIENT_ID / CLIENT_SECRET).");
  }
  const creds = btoa(`${clientId}:${secret}`);
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description ?? "OAuth PayPal");
  return { token: data.access_token as string, base };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié" }, 401);

    const body = await req.json().catch(() => ({}));
    const returnUrl = body?.returnUrl as string | undefined;
    const cancelUrl = body?.cancelUrl as string | undefined;
    if (!returnUrl || !cancelUrl) {
      return json({ error: "returnUrl et cancelUrl requis" }, 400);
    }

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

    const { token, base } = await paypalAccessToken();

    const orderRes = await fetch(`${base}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "EUR",
              value: BOOST_AMOUNT,
            },
            description: "Aypik Boost 24 h",
            custom_id: user.id,
          },
        ],
        application_context: {
          brand_name: "Aypik",
          landing_page: "NO_PREFERENCE",
          user_action: "PAY_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    });

    const order = await orderRes.json();
    if (!orderRes.ok) {
      return json(
        { error: order?.message ?? order?.error ?? "Création ordre PayPal" },
        500
      );
    }

    const approve = (order.links as Array<{ rel: string; href: string }>)?.find(
      (l) => l.rel === "approve"
    );

    if (!approve?.href) {
      return json({ error: "URL d’approbation PayPal manquante." }, 500);
    }

    return json({
      orderId: order.id,
      approveUrl: approve.href,
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
