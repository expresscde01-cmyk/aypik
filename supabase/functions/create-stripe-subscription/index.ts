import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type PlanTier = "confort" | "premium";

const PLAN_AMOUNT_CENTS: Record<PlanTier, number> = {
  confort: 1999,
  premium: 2499,
};

function parsePlan(raw: unknown): PlanTier {
  return raw === "premium" ? "premium" : "confort";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const plan = parsePlan((body as { plan?: unknown })?.plan);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const priceId =
      plan === "premium"
        ? Deno.env.get("STRIPE_PREMIUM_PRICE_ID")
        : Deno.env.get("STRIPE_CONFORT_PRICE_ID");
    if (!stripeKey || !priceId) {
      return json(
        {
          error:
            plan === "premium"
              ? "Stripe n'est pas configuré (STRIPE_SECRET_KEY / STRIPE_PREMIUM_PRICE_ID)."
              : "Stripe n'est pas configuré (STRIPE_SECRET_KEY / STRIPE_CONFORT_PRICE_ID).",
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

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-11-20.acacia",
    });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: membership } = await admin
      .from("memberships")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = membership?.stripe_customer_id as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("memberships").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        plan: "free",
      });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
      metadata: { supabase_user_id: user.id, plan },
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    await admin.from("payment_subscriptions").insert({
      user_id: user.id,
      provider: "stripe",
      provider_subscription_id: subscription.id,
      provider_customer_id: customerId,
      status: "incomplete",
      plan,
      amount_cents: PLAN_AMOUNT_CENTS[plan],
      currency: "EUR",
      interval: "month",
    });

    return json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
      customerId,
      plan,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Stripe";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
