/** 2 Boosts de 24 h inclus, seulement pour un abonnement Premium payé. */

export const PREMIUM_BOOSTS_PER_PERIOD = 2;

export type PremiumBoostAccount = {
  plan: string | null;
  paidPremiumStartedAt: string | null;
  premiumUntil: string | null;
  remaining: number;
  /** premium_until pour lequel les 2 ont déjà été posés. */
  periodEnd: string | null;
};

export function isPaidPremiumSubscription(
  account: Pick<
    PremiumBoostAccount,
    'plan' | 'paidPremiumStartedAt' | 'premiumUntil'
  >,
  nowMs: number
): boolean {
  if (account.plan !== 'premium') return false;
  if (!account.paidPremiumStartedAt) return false;
  if (!account.premiumUntil) return false;
  return Date.parse(account.premiumUntil) > nowMs;
}

/**
 * Repose 2 seulement quand premium_until change.
 * Un second passage sur la même période, ou deux lectures dont la
 * première a déjà écrit, ne crédite pas une seconde fois.
 */
export function refreshPremiumBoostCredit(
  account: PremiumBoostAccount,
  nowMs: number
): { account: PremiumBoostAccount; granted: boolean } {
  if (!isPaidPremiumSubscription(account, nowMs)) {
    return { account, granted: false };
  }
  if (account.periodEnd === account.premiumUntil) {
    return { account, granted: false };
  }
  return {
    granted: true,
    account: {
      ...account,
      remaining: PREMIUM_BOOSTS_PER_PERIOD,
      periodEnd: account.premiumUntil,
    },
  };
}

export function usablePremiumBoosts(
  account: PremiumBoostAccount,
  nowMs: number
): number {
  if (!account.paidPremiumStartedAt || !account.premiumUntil) return 0;
  if (Date.parse(account.premiumUntil) <= nowMs) return 0;
  if (account.periodEnd !== account.premiumUntil) return 0;
  return Math.max(0, account.remaining);
}

/** Achat payant à partir d'Essentiel. Gratuit, Basique et Fondateur : non. */
export function canPurchasePaidBoost(plan: string | null | undefined): boolean {
  return plan === 'essentiel' || plan === 'confort' || plan === 'premium';
}

export type BoostSource = 'founder' | 'premium' | 'paid' | 'refused';

export function nextBoostSource(input: {
  founderRemaining: number;
  premiumRemaining: number;
  plan: string | null;
}): BoostSource {
  if (input.founderRemaining > 0) return 'founder';
  if (input.premiumRemaining > 0) return 'premium';
  if (canPurchasePaidBoost(input.plan)) return 'paid';
  return 'refused';
}
