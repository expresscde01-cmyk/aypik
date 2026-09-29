import {
  decideCheckout,
  founderPriceCents,
  isTierPlan,
  paymentGate,
  paymentsEnabledFromSetting,
  prorataDifferenceCents,
  type CheckoutDecision,
} from "./billingPolicy.ts";

export type MembershipCheckoutRow = {
  is_founder?: boolean | null;
  plan?: string | null;
  premium_until?: string | null;
  francophone_until?: string | null;
  international_until?: string | null;
  stripe_customer_id?: string | null;
};

export type ActiveSub = {
  plan: string | null;
  status: string | null;
  provider: string | null;
  provider_subscription_id: string | null;
};

export function gateForChannel(input: {
  settingValue: unknown;
  channel: "stripe" | "paypal";
  stripeSecretKey?: string | null;
  paypalApiBase?: string | null;
}) {
  return paymentGate({
    paymentsEnabled: paymentsEnabledFromSetting(input.settingValue),
    channel: input.channel,
    stripeSecretKey: input.stripeSecretKey,
    paypalApiBase: input.paypalApiBase,
  });
}

export function activePlanNames(subs: ActiveSub[]): string[] {
  return subs
    .map((sub) => sub.plan)
    .filter((plan): plan is string => Boolean(plan));
}

export function tierSubscription(
  subs: ActiveSub[],
  provider: "stripe" | "paypal"
): ActiveSub | null {
  return (
    subs.find(
      (sub) =>
        sub.provider === provider &&
        isTierPlan(sub.plan) &&
        (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due")
    ) ?? null
  );
}

export function periodFractions(
  periodStartMs: number,
  periodEndMs: number,
  nowMs: number
): { daysLeft: number; daysInPeriod: number } {
  const day = 86_400_000;
  const daysInPeriod = Math.max(1, Math.round((periodEndMs - periodStartMs) / day));
  const daysLeft = Math.max(0, Math.ceil((periodEndMs - nowMs) / day));
  return { daysLeft, daysInPeriod };
}

export function upgradeProrataCents(input: {
  currentPublicCents: number;
  nextPublicCents: number;
  founder: boolean;
  daysLeft: number;
  daysInPeriod: number;
}): number {
  const current = input.founder
    ? founderPriceCents(input.currentPublicCents)
    : input.currentPublicCents;
  const next = input.founder
    ? founderPriceCents(input.nextPublicCents)
    : input.nextPublicCents;
  return prorataDifferenceCents(
    current,
    next,
    input.daysLeft,
    input.daysInPeriod
  );
}

export function checkoutForMember(input: {
  membership: MembershipCheckoutRow | null;
  targetPlan: string;
  subs: ActiveSub[];
}): CheckoutDecision {
  return decideCheckout({
    currentPlan: input.membership?.plan,
    targetPlan: input.targetPlan,
    activePlans: activePlanNames(input.subs),
  });
}
