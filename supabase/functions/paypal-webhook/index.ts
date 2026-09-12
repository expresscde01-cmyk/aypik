import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type SupabaseAdmin = ReturnType<typeof createClient>;

/**
 * Le palier acheté (confort | premium) est déterminé à la création de
 * l'abonnement (cf. create-paypal-subscription) et stocké dans
 * payment_subscriptions.plan — c'est la source de vérité.
 */
async function getPlanForSubscription(
  admin: SupabaseAdmin,
  subscriptionId: string | undefined
): Promise<"confort" | "premium"> {
  if (!subscriptionId) return "confort";
  const { data } = await admin
    .from("payment_subscriptions")
    .select("plan")
    .eq("provider", "paypal")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();
  return data?.plan === "premium" ? "premium" : "confort";
}

/**
 * Webhook PayPal (Billing Subscriptions).
 * Configurez l'URL dans le dashboard PayPal :
 *   https://<project>.supabase.co/functions/v1/paypal-webhook
 * Événements : BILLING.SUBSCRIPTION.ACTIVATED / CANCELLED / SUSPENDED
 */
Deno.serve(async (req) => {
  try {
    const event = await req.json();
    const eventType = event.event_type as string | undefined;
    const resource = event.resource ?? {};

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const subscriptionId = resource.id as string | undefined;
    const userId = (resource.custom_id as string | undefined) ?? undefined;

    if (
      eventType === "BILLING.SUBSCRIPTION.ACTIVATED" ||
      eventType === "BILLING.SUBSCRIPTION.UPDATED"
    ) {
      if (userId && subscriptionId) {
        const plan = await getPlanForSubscription(admin, subscriptionId);
        await admin.rpc("activate_paid_premium", {
          p_user_id: userId,
          p_provider: "paypal",
          p_period_end: null,
          p_plan: plan,
        });
        await admin
          .from("payment_subscriptions")
          .update({ status: "active" })
          .eq("provider", "paypal")
          .eq("provider_subscription_id", subscriptionId);
        await admin
          .from("memberships")
          .update({ paypal_subscriber_id: resource.subscriber?.payer_id })
          .eq("user_id", userId);
      }
    }

    if (
      eventType === "BILLING.SUBSCRIPTION.CANCELLED" ||
      eventType === "BILLING.SUBSCRIPTION.EXPIRED" ||
      eventType === "BILLING.SUBSCRIPTION.SUSPENDED"
    ) {
      if (userId) {
        await admin.rpc("cancel_paid_premium", { p_user_id: userId });
      } else if (subscriptionId) {
        const { data: row } = await admin
          .from("payment_subscriptions")
          .select("user_id")
          .eq("provider", "paypal")
          .eq("provider_subscription_id", subscriptionId)
          .maybeSingle();
        if (row?.user_id) {
          await admin.rpc("cancel_paid_premium", { p_user_id: row.user_id });
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur webhook";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
