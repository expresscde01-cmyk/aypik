import { founderPriceCents } from "./billingPolicy.ts";

export type PlanTier =
  | "basique"
  | "essentiel"
  | "confort"
  | "premium"
  | "visibilite"
  | "francophone"
  | "international";

export const PLAN_AMOUNT_CENTS: Record<PlanTier, number> = {
  basique: 999,
  essentiel: 1499,
  confort: 1999,
  premium: 2499,
  visibilite: 299,
  francophone: 299,
  international: 599,
};

export const INTERNATIONAL_UPGRADE_CENTS = 299;

export function qualifiesForInternationalUpgrade(row: {
  plan?: string | null;
  francophone_until?: string | null;
  international_until?: string | null;
}): boolean {
  const plan = row.plan ?? "";
  if (plan === "confort" || plan === "premium" || plan === "founder") {
    return true;
  }
  const stillActive = (iso: string | null | undefined) =>
    Boolean(iso) && Date.parse(iso) > Date.now();
  return (
    stillActive(row.francophone_until) || stillActive(row.international_until)
  );
}

export function internationalCheckoutAmountCents(
  qualifiesUpgrade: boolean
): number {
  return qualifiesUpgrade ? INTERNATIONAL_UPGRADE_CENTS : PLAN_AMOUNT_CENTS.international;
}

const TIER_PLANS: PlanTier[] = ["basique", "essentiel", "confort", "premium"];
const ADDON_PLANS: PlanTier[] = ["visibilite", "francophone", "international"];

export function parsePlan(raw: unknown): PlanTier {
  if (
    raw === "basique" ||
    raw === "essentiel" ||
    raw === "confort" ||
    raw === "premium" ||
    raw === "visibilite" ||
    raw === "francophone" ||
    raw === "international"
  ) {
    return raw;
  }
  return "confort";
}

export function isAddonPlan(
  plan: PlanTier
): plan is "visibilite" | "francophone" | "international" {
  return (ADDON_PLANS as string[]).includes(plan);
}

export function isPaidTierPlan(plan: PlanTier): boolean {
  return (TIER_PLANS as string[]).includes(plan);
}

export function stripePriceEnvName(plan: PlanTier): string {
  switch (plan) {
    case "basique":
      return "STRIPE_BASIQUE_PRICE_ID";
    case "essentiel":
      return "STRIPE_ESSENTIEL_PRICE_ID";
    case "confort":
      return "STRIPE_CONFORT_PRICE_ID";
    case "premium":
      return "STRIPE_PREMIUM_PRICE_ID";
    case "visibilite":
      return "STRIPE_VISIBILITE_PRICE_ID";
    case "francophone":
      return "STRIPE_FRANCOPHONE_PRICE_ID";
    case "international":
      return "STRIPE_INTERNATIONAL_PRICE_ID";
  }
}

export function stripeInternationalPriceEnv(qualifiesUpgrade: boolean): string {
  return qualifiesUpgrade
    ? "STRIPE_INTERNATIONAL_UPGRADE_PRICE_ID"
    : "STRIPE_INTERNATIONAL_PRICE_ID";
}

export function storedPlan(raw: unknown): PlanTier {
  return parsePlan(raw);
}

export async function activatePaidOffer(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> },
  userId: string,
  plan: PlanTier,
  provider: string,
  periodEnd: string | null
): Promise<void> {
  if (isAddonPlan(plan)) {
    await admin.rpc("activate_paid_addon", {
      p_user_id: userId,
      p_offer: plan,
      p_period_end: periodEnd,
    });
    return;
  }
  await admin.rpc("activate_paid_premium", {
    p_user_id: userId,
    p_provider: provider,
    p_period_end: periodEnd,
    p_plan: plan,
  });
}

export function paypalPlanEnvName(plan: PlanTier): string {
  switch (plan) {
    case "basique":
      return "PAYPAL_BASIQUE_PLAN_ID";
    case "essentiel":
      return "PAYPAL_ESSENTIEL_PLAN_ID";
    case "confort":
      return "PAYPAL_CONFORT_PLAN_ID";
    case "premium":
      return "PAYPAL_PREMIUM_PLAN_ID";
    case "visibilite":
      return "PAYPAL_VISIBILITE_PLAN_ID";
    case "francophone":
      return "PAYPAL_FRANCOPHONE_PLAN_ID";
    case "international":
      return "PAYPAL_INTERNATIONAL_PLAN_ID";
  }
}

export function paypalInternationalPlanEnv(qualifiesUpgrade: boolean): string {
  return qualifiesUpgrade
    ? "PAYPAL_INTERNATIONAL_UPGRADE_PLAN_ID"
    : "PAYPAL_INTERNATIONAL_PLAN_ID";
}

function founderPriceEnv(name: string, founder: boolean): string {
  if (!founder) return name;
  if (name.endsWith("_PRICE_ID")) {
    return name.replace(/_PRICE_ID$/, "_FOUNDER_PRICE_ID");
  }
  if (name.endsWith("_PLAN_ID")) {
    return name.replace(/_PLAN_ID$/, "_FOUNDER_PLAN_ID");
  }
  return name;
}

/**
 * Prix choisi ici, jamais par le client.
 * Fondateur : identifiant dédié au montant déjà arrondi.
 */
export function resolveCheckoutEnv(
  kind: "stripe" | "paypal",
  plan: PlanTier,
  qualifiesIntlUpgrade: boolean,
  getEnv: (name: string) => string | undefined,
  founder = false
): { envName: string; amountCents: number; publicCents: number } {
  let envName: string;
  let publicCents: number;
  if (plan !== "international") {
    envName =
      kind === "stripe" ? stripePriceEnvName(plan) : paypalPlanEnvName(plan);
    publicCents = PLAN_AMOUNT_CENTS[plan];
  } else {
    publicCents = internationalCheckoutAmountCents(qualifiesIntlUpgrade);
    const preferred =
      kind === "stripe"
        ? stripeInternationalPriceEnv(qualifiesIntlUpgrade)
        : paypalInternationalPlanEnv(qualifiesIntlUpgrade);
    if (getEnv(preferred) || founder) {
      envName = preferred;
    } else if (qualifiesIntlUpgrade) {
      envName =
        kind === "stripe"
          ? "STRIPE_VISIBILITE_PRICE_ID"
          : "PAYPAL_VISIBILITE_PLAN_ID";
    } else {
      envName = preferred;
    }
  }
  const named = founderPriceEnv(envName, founder);
  return {
    envName: named,
    publicCents,
    amountCents: founder ? founderPriceCents(publicCents) : publicCents,
  };
}
