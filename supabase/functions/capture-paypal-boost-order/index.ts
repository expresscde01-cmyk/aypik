import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    const orderId = body?.orderId as string | undefined;
    if (!orderId) return json({ error: "orderId requis" }, 400);

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

    const captureRes = await fetch(
      `${base}/v2/checkout/orders/${orderId}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    const capture = await captureRes.json();
    if (!captureRes.ok) {
      return json(
        {
          error:
            capture?.message ??
            capture?.details?.[0]?.description ??
            "Capture PayPal échouée",
        },
        500
      );
    }

    const status = capture?.status as string | undefined;
    if (status !== "COMPLETED") {
      return json({ error: `Statut PayPal inattendu : ${status}` }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: boostError } = await admin.rpc("activate_paid_boost", {
      p_user_id: user.id,
      p_provider: "paypal",
      p_payment_ref: orderId,
    });

    if (boostError) {
      return json({ error: boostError.message }, 500);
    }

    return json({ ok: true, orderId, status });
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
