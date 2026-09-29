import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  PLAN_AMOUNT_CENTS,
  parsePlan,
  qualifiesForInternationalUpgrade,
  resolveCheckoutEnv,
  type PlanTier,
} from "../_shared/plans.ts";
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

    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const apiBase =
      Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com";

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
      channel: "paypal",
      paypalApiBase: apiBase,
    });
    if (!gate.allowed) {
      return json({ error: "payments_disabled", code: "payments_disabled" }, 403);
    }

    const { data: membership } = await admin
      .from("memberships")
      .select("plan, is_founder, premium_until, francophone_until, international_until")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: subRows } = await admin
      .from("payment_subscriptions")
      .select("plan, status, provider, provider_subscription_id")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "incomplete", "pending", "past_due"]);
    const subs = (subRows ?? []) as ActiveSub[];
    const decision = checkoutForMember({ membership, targetPlan: plan, subs });
    if (decision.kind === "duplicate") {
      return json({ error: "already_subscribed", code: "duplicate_purchase" }, 409);
    }
    if (decision.kind === "downgrade") {
      const effectiveAt = membership?.premium_until ?? null;
      await admin
        .from("memberships")
        .update({ pending_plan: plan, pending_plan_at: effectiveAt })
        .eq("user_id", user.id);
      return json({
        scheduled: true,
        effectiveAt,
        plan,
      });
    }

    const founder = membership?.is_founder === true;
    const checkout = resolveCheckoutEnv(
      "paypal",
      plan,
      qualifiesForInternationalUpgrade(membership ?? {}),
      (name) => Deno.env.get(name),
      founder
    );
    const planId = Deno.env.get(checkout.envName);

    if (!clientId || !clientSecret || !planId) {
      return json(
        {
          error: `PayPal n'est pas configuré (PAYPAL_CLIENT_ID / SECRET / ${checkout.envName}).`,
        },
        503
      );
    }

    const returnUrl =
      (body as { returnUrl?: string })?.returnUrl ??
      `${Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:5173"}/?paypal=success`;
    const cancelUrl =
      (body as { cancelUrl?: string })?.cancelUrl ??
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

    const currentTier = tierSubscription(subs, "paypal");
    let prorataApproveUrl: string | null = null;
    let prorataCents = 0;
    if (decision.kind === "upgrade" && currentTier && membership?.premium_until) {
      const endMs = Date.parse(membership.premium_until);
      const fractions = periodFractions(endMs - 30 * 86_400_000, endMs, Date.now());
      const currentPublic =
        PLAN_AMOUNT_CENTS[currentTier.plan as PlanTier] ?? checkout.publicCents;
      prorataCents = upgradeProrataCents({
        currentPublicCents: currentPublic,
        nextPublicCents: checkout.publicCents,
        founder: membership?.is_founder === true,
        daysLeft: fractions.daysLeft,
        daysInPeriod: fractions.daysInPeriod,
      });
      if (prorataCents > 0) {
        const orderRes = await fetch(`${apiBase}/v2/checkout/orders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [
              {
                custom_id: user.id,
                description: "Montée en gamme",
                amount: {
                  currency_code: "EUR",
                  value: (prorataCents / 100).toFixed(2),
                },
              },
            ],
          }),
        });
        const order = await orderRes.json();
        if (orderRes.ok) {
          prorataApproveUrl =
            (order.links || []).find((link: { rel: string }) => link.rel === "approve")
              ?.href ?? null;
        }
      }
    }

    const startTime =
      decision.kind === "upgrade" &&
      membership?.premium_until &&
      Date.parse(membership.premium_until) > Date.now()
        ? membership.premium_until
        : undefined;

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
        ...(startTime ? { start_time: startTime } : {}),
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

    await admin.from("payment_subscriptions").insert({
      user_id: user.id,
      provider: "paypal",
      provider_subscription_id: subscription.id,
      status: "pending",
      plan,
      amount_cents: checkout.amountCents,
      currency: "EUR",
      interval: "month",
      replaces_subscription_id: currentTier?.provider_subscription_id ?? null,
    });

    return json({
      subscriptionId: subscription.id,
      approveUrl: prorataApproveUrl ?? approveLink,
      subscriptionApproveUrl: prorataApproveUrl ? approveLink : null,
      prorataCents,
      plan,
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
