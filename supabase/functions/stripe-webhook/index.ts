import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return new Response("Stripe webhook non configuré", { status: 503 });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-11-20.acacia",
  });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Signature manquante", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return new Response("Signature invalide", { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.created"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.supabase_user_id;
    if (userId && (sub.status === "active" || sub.status === "trialing")) {
      const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
      await admin.rpc("activate_paid_premium", {
        p_user_id: userId,
        p_provider: "stripe",
        p_period_end: periodEnd,
      });
      await admin
        .from("payment_subscriptions")
        .update({
          status: sub.status === "trialing" ? "trialing" : "active",
          current_period_end: periodEnd,
          cancel_at_period_end: sub.cancel_at_period_end,
        })
        .eq("provider", "stripe")
        .eq("provider_subscription_id", sub.id);
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const subId =
      typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;
    if (subId) {
      const sub = await stripe.subscriptions.retrieve(subId);
      const userId = sub.metadata?.supabase_user_id;
      if (userId) {
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        await admin.rpc("activate_paid_premium", {
          p_user_id: userId,
          p_provider: "stripe",
          p_period_end: periodEnd,
        });
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.supabase_user_id;
    if (userId) {
      await admin.rpc("cancel_paid_premium", { p_user_id: userId });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
