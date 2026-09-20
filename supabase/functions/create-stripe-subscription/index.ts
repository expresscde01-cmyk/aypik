import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import {
  parsePlan,
  qualifiesForInternationalUpgrade,
  resolveCheckoutEnv,
} from "../_shared/plans.ts";
import {
  checkoutPlanRequiresNative,
  hasNativeSpokenLanguagePayload,
} from "../_shared/nativeLanguage.ts";

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
    const body = await req.json().catch(() => ({}));
    const plan = parsePlan((body as { plan?: unknown })?.plan);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

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

    if (checkoutPlanRequiresNative(plan)) {
      const { data: spoken } = await admin
        .from("profiles")
        .select("languages")
        .eq("id", user.id)
        .maybeSingle();
      if (!hasNativeSpokenLanguagePayload(spoken?.languages)) {
        return json(
          {
            error: "Langue maternelle requise",
            code: "native_language_required",
          },
          400,
        );
      }
    }

    const { data: membership } = await admin
      .from("memberships")
      .select("stripe_customer_id, plan, francophone_until, international_until")
      .eq("user_id", user.id)
      .maybeSingle();

    const intlUpgrade = qualifiesForInternationalUpgrade(membership ?? {});
    const checkout = resolveCheckoutEnv(
      "stripe",
      plan,
      intlUpgrade,
      (name) => Deno.env.get(name)
    );
    const priceId = Deno.env.get(checkout.envName);
    if (!stripeKey || !priceId) {
      return json(
        {
          error: `Stripe n'est pas configuré (STRIPE_SECRET_KEY / ${checkout.envName}).`,
        },
        503
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-11-20.acacia",
    });

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
      amount_cents: checkout.amountCents,
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
