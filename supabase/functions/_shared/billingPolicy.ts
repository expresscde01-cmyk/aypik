/** Règles de facturation du lot 1. Aucun prix ne vient du client. */

export const BOOST_PUBLIC_CENTS = 299;

export const TIER_RANK = {
  basique: 1,
  essentiel: 2,
  confort: 3,
  premium: 4,
} as const;

export type TierPlan = keyof typeof TIER_RANK;

export function founderPriceCents(publicCents: number): number {
  if (!Number.isFinite(publicCents) || publicCents <= 0) return 0;
  return Math.round(publicCents / 2);
}

/** Écart des prix déjà réduits, puis même arrondi au demi-centime supérieur. */
export function prorataDifferenceCents(
  currentCents: number,
  nextCents: number,
  daysLeft: number,
  daysInPeriod: number
): number {
  if (daysInPeriod <= 0 || daysLeft <= 0) return 0;
  const diff = nextCents - currentCents;
  if (diff <= 0) return 0;
  const left = Math.min(daysLeft, daysInPeriod);
  return Math.round((diff * left) / daysInPeriod);
}

export function serverChargeCents(input: {
  founder: boolean;
  publicCents: number;
  requestedCents?: number | null;
  requestedPriceId?: string | null;
}): number {
  void input.requestedCents;
  void input.requestedPriceId;
  return input.founder
    ? founderPriceCents(input.publicCents)
    : input.publicCents;
}

export function paymentsEnabledFromSetting(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function paymentGate(input: {
  paymentsEnabled: boolean;
  channel: "stripe" | "paypal";
  stripeSecretKey?: string | null;
  paypalApiBase?: string | null;
}): { allowed: boolean; mode: "live" | "test" | "blocked" } {
  const test =
    input.channel === "stripe"
      ? (input.stripeSecretKey ?? "").startsWith("sk_test_")
      : (input.paypalApiBase ?? "").toLowerCase().includes("sandbox");
  if (input.paymentsEnabled) {
    return { allowed: true, mode: test ? "test" : "live" };
  }
  if (test) return { allowed: true, mode: "test" };
  return { allowed: false, mode: "blocked" };
}

/** Un webhook n'active rien sans signature vérifiée. */
export function webhookMayActivate(signatureValid: boolean): boolean {
  return signatureValid === true;
}

export function includedAddons(plan: string | null | undefined): string[] {
  if (plan === "premium") return ["visibilite", "francophone", "international"];
  if (plan === "confort") return ["francophone"];
  return [];
}

export function isTierPlan(plan: string | null | undefined): plan is TierPlan {
  return plan === "basique" || plan === "essentiel" || plan === "confort" || plan === "premium";
}

export type CheckoutDecision =
  | { kind: "duplicate" }
  | { kind: "downgrade"; cancelNow: string[] }
  | { kind: "upgrade"; cancelNow: string[] }
  | { kind: "subscribe"; cancelNow: string[] };

/**
 * Un seul prélèvement par droit.
 * Visibilité et une option géographique restent deux abonnements.
 */
export function decideCheckout(input: {
  currentPlan: string | null | undefined;
  targetPlan: string;
  activePlans: string[];
}): CheckoutDecision {
  const active = new Set(input.activePlans);
  if (active.has(input.targetPlan)) return { kind: "duplicate" };

  if (isTierPlan(input.targetPlan) && isTierPlan(input.currentPlan)) {
    const current = TIER_RANK[input.currentPlan];
    const next = TIER_RANK[input.targetPlan];
    if (next < current) return { kind: "downgrade", cancelNow: [] };
    if (next > current) {
      return {
        kind: "upgrade",
        cancelNow: includedAddons(input.targetPlan).filter((plan) =>
          active.has(plan)
        ),
      };
    }
    return { kind: "duplicate" };
  }

  if (input.targetPlan === "international" && active.has("francophone")) {
    return { kind: "upgrade", cancelNow: ["francophone"] };
  }

  if (isTierPlan(input.targetPlan)) {
    return {
      kind: "subscribe",
      cancelNow: includedAddons(input.targetPlan).filter((plan) =>
        active.has(plan)
      ),
    };
  }

  return { kind: "subscribe", cancelNow: [] };
}
