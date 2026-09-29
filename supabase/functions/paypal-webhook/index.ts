import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { activatePaidOffer, parsePlan, type PlanTier } from "../_shared/plans.ts";

type SupabaseAdmin = ReturnType<typeof createClient>;

async function getPlanForSubscription(
  admin: SupabaseAdmin,
  subscriptionId: string | undefined
): Promise<PlanTier> {
  if (!subscriptionId) return "confort";
  const { data } = await admin
    .from("payment_subscriptions")
    .select("plan")
    .eq("provider", "paypal")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();
  return parsePlan(data?.plan);
}

/**
 * Webhook PayPal (Billing Subscriptions).
 * Configurez l'URL dans le dashboard PayPal :
 *   https://<project>.supabase.co/functions/v1/paypal-webhook
 * Événements : BILLING.SUBSCRIPTION.ACTIVATED / CANCELLED / SUSPENDED
 */
async function paypalSignatureValid(
  req: Request,
  event: unknown
): Promise<boolean> {
  const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  const apiBase =
    Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com";
  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionTime = req.headers.get("paypal-transmission-time");
  const transmissionSig = req.headers.get("paypal-transmission-sig");
  const certUrl = req.headers.get("paypal-cert-url");
  const authAlgo = req.headers.get("paypal-auth-algo");
  if (
    !webhookId ||
    !clientId ||
    !clientSecret ||
    !transmissionId ||
    !transmissionTime ||
    !transmissionSig ||
    !certUrl ||
    !authAlgo
  ) {
    return false;
  }
  const tokenRes = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) return false;
  const tokenData = await tokenRes.json();
  const verifyRes = await fetch(
    `${apiBase}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: event,
      }),
    }
  );
  if (!verifyRes.ok) return false;
  const verify = await verifyRes.json();
  return verify.verification_status === "SUCCESS";
}

Deno.serve(async (req) => {
  try {
    const event = await req.json();
    if (!(await paypalSignatureValid(req, event))) {
      return new Response("Signature invalide", { status: 400 });
    }
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
        await activatePaidOffer(admin, userId, plan, "paypal", null);
        const { data: stored } = await admin
          .from("payment_subscriptions")
          .select("replaces_subscription_id")
          .eq("provider", "paypal")
          .eq("provider_subscription_id", subscriptionId)
          .maybeSingle();
        await admin
          .from("payment_subscriptions")
          .update({ status: "active" })
          .eq("provider", "paypal")
          .eq("provider_subscription_id", subscriptionId);
        const replaced = stored?.replaces_subscription_id as string | null;
        if (replaced) {
          await admin
            .from("payment_subscriptions")
            .update({ status: "canceled" })
            .eq("provider", "paypal")
            .eq("provider_subscription_id", replaced);
        }
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
