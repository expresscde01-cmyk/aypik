import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import {
  PLAN_AMOUNT_CENTS,
  parsePlan,
  qualifiesForInternationalUpgrade,
  resolveCheckoutEnv,
  type PlanTier,
} from "../_shared/plans.ts";
import { isTierPlan } from "../_shared/billingPolicy.ts";
import {
  checkoutForMember,
  gateForChannel,
  periodFractions,
  tierSubscription,
  upgradeProrataCents,
  type ActiveSub,
} from "../_shared/checkoutFlow.ts";
import {
  checkoutPlanRequiresNative,
  hasNativeSpokenLanguagePayload,
} from "../_shared/nativeLanguage.ts";

async function cancelReplaced(
  stripe: Stripe,
  admin: ReturnType<typeof createClient>,
  subs: ActiveSub[],
  plans: string[]
) {
  for (const planName of plans) {
    const match = subs.find(
      (sub) =>
        sub.plan === planName &&
        sub.provider === "stripe" &&
        sub.provider_subscription_id
    );
    if (!match?.provider_subscription_id) continue;
    await stripe.subscriptions.cancel(match.provider_subscription_id);
    await admin
      .from("payment_subscriptions")
      .update({ status: "canceled" })
      .eq("provider", "stripe")
      .eq("provider_subscription_id", match.provider_subscription_id);
  }
}

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

    const { data: setting } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "payments_enabled")
      .maybeSingle();
    const gate = gateForChannel({
      settingValue: setting?.value,
      channel: "stripe",
      stripeSecretKey: stripeKey,
    });
    if (!gate.allowed) {
      return json({ error: "payments_disabled", code: "payments_disabled" }, 403);
    }

    const { data: membership } = await admin
      .from("memberships")
      .select(
        "stripe_customer_id, plan, is_founder, premium_until, francophone_until, international_until"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: subRows } = await admin
      .from("payment_subscriptions")
      .select("plan, status, provider, provider_subscription_id")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "incomplete", "pending", "past_due"]);
    const subs = (subRows ?? []) as ActiveSub[];
    const decision = checkoutForMember({
      membership,
      targetPlan: plan,
      subs,
    });
    if (decision.kind === "duplicate") {
      return json({ error: "already_subscribed", code: "duplicate_purchase" }, 409);
    }

    const founder = membership?.is_founder === true;
    const intlUpgrade = qualifiesForInternationalUpgrade(membership ?? {});
    const checkout = resolveCheckoutEnv(
      "stripe",
      plan,
      intlUpgrade,
      (name) => Deno.env.get(name),
      founder
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

    const currentTier = tierSubscription(subs, "stripe");
    if (decision.kind === "downgrade") {
      const effectiveAt = membership?.premium_until ?? null;
      await admin
        .from("memberships")
        .update({ pending_plan: plan, pending_plan_at: effectiveAt })
        .eq("user_id", user.id);
      if (currentTier?.provider_subscription_id && effectiveAt) {
        const existing = await stripe.subscriptions.retrieve(
          currentTier.provider_subscription_id
        );
        const schedule = await stripe.subscriptionSchedules.create({
          from_subscription: existing.id,
        });
        const phase = schedule.phases[0];
        await stripe.subscriptionSchedules.update(schedule.id, {
          end_behavior: "release",
          phases: [
            {
              items: phase.items.map((item) => ({
                price: typeof item.price === "string" ? item.price : item.price.id,
                quantity: item.quantity ?? 1,
              })),
              start_date: phase.start_date,
              end_date: phase.end_date,
            },
            {
              items: [{ price: priceId, quantity: 1 }],
              proration_behavior: "none",
            },
          ],
        });
      }
      return json({
        scheduled: true,
        effectiveAt,
        plan,
        amountCents: checkout.amountCents,
      });
    }

    if (decision.kind === "upgrade" && currentTier?.provider_subscription_id) {
      const existing = await stripe.subscriptions.retrieve(
        currentTier.provider_subscription_id
      );
      const item = existing.items.data[0];
      const fractions = periodFractions(
        existing.current_period_start * 1000,
        existing.current_period_end * 1000,
        Date.now()
      );
      const currentPublic =
        PLAN_AMOUNT_CENTS[currentTier.plan as PlanTier] ?? checkout.publicCents;
      const prorata = upgradeProrataCents({
        currentPublicCents: currentPublic,
        nextPublicCents: checkout.publicCents,
        founder,
        daysLeft: fractions.daysLeft,
        daysInPeriod: fractions.daysInPeriod,
      });
      let clientSecret: string | null = null;
      if (prorata > 0) {
        await stripe.invoiceItems.create({
          customer: customerId,
          amount: prorata,
          currency: "eur",
          description: "Montée en gamme",
        });
        const invoice = await stripe.invoices.create({
          customer: customerId,
          auto_advance: false,
          pending_invoice_items_behavior: "include",
        });
        const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
        const intentId =
          typeof finalized.payment_intent === "string"
            ? finalized.payment_intent
            : finalized.payment_intent?.id;
        if (intentId) {
          const intent = await stripe.paymentIntents.retrieve(intentId);
          clientSecret = intent.client_secret;
        }
      }
      await stripe.subscriptions.update(existing.id, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: "none",
        metadata: { supabase_user_id: user.id, plan },
      });
      await cancelReplaced(stripe, admin, subs, decision.cancelNow);
      await admin
        .from("payment_subscriptions")
        .update({ plan, amount_cents: checkout.amountCents })
        .eq("provider", "stripe")
        .eq("provider_subscription_id", existing.id);
      if (prorata > 0 && !clientSecret) {
        return json({ error: "Paiement de la différence indisponible" }, 502);
      }
      return json({
        subscriptionId: existing.id,
        clientSecret,
        customerId,
        plan,
        prorataCents: prorata,
        amountCents: checkout.amountCents,
      });
    }

    await cancelReplaced(stripe, admin, subs, decision.cancelNow);
    for (const other of subs) {
      if (other.provider !== "paypal" || !other.provider_subscription_id) continue;
      if (!isTierPlan(other.plan) && !decision.cancelNow.includes(other.plan ?? "")) {
        continue;
      }
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
            `${apiBase}/v1/billing/subscriptions/${other.provider_subscription_id}/cancel`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ reason: "Remplacé par une autre offre" }),
            }
          );
        }
      }
      await admin
        .from("payment_subscriptions")
        .update({ status: "canceled" })
        .eq("provider", "paypal")
        .eq("provider_subscription_id", other.provider_subscription_id);
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
