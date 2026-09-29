/** Deux Boosts de 24 h, crédités une seule fois au passage au payant. */
export const FOUNDER_BOOST_COUNT = 2;

/** Valables 6 mois. Au passage au payant, la date est la même pour tous. */
export const FOUNDER_BOOST_VALIDITY_MONTHS = 6;

export const BOOST_EXTEND_MS = 24 * 60 * 60 * 1000;

export type FounderBoostWallet = {
  userId: string;
  remaining: number;
  expiresAtMs: number;
};

export function addCalendarMonths(at: Date, months: number): Date {
  const next = new Date(at.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function creditFounderBoosts(
  founderIds: string[],
  paidLaunchAt: Date
): FounderBoostWallet[] {
  const expiresAtMs = addCalendarMonths(
    paidLaunchAt,
    FOUNDER_BOOST_VALIDITY_MONTHS
  ).getTime();
  return founderIds.map((userId) => ({
    userId,
    remaining: FOUNDER_BOOST_COUNT,
    expiresAtMs,
  }));
}

export function usableFounderBoosts(
  wallet: FounderBoostWallet | null,
  nowMs: number
): number {
  if (!wallet || nowMs >= wallet.expiresAtMs) return 0;
  return Math.max(0, wallet.remaining);
}

/** Prolonge de 24 h un Boost déjà en cours, sinon part de maintenant. */
export function nextBoostEndsAt(
  currentEndsAtMs: number | null,
  nowMs: number
): number {
  const base =
    currentEndsAtMs != null && currentEndsAtMs > nowMs
      ? currentEndsAtMs
      : nowMs;
  return base + BOOST_EXTEND_MS;
}

export function activateBoost(input: {
  wallet: FounderBoostWallet | null;
  nowMs: number;
  activeEndsAtMs: number | null;
}): {
  wallet: FounderBoostWallet | null;
  source: 'founder' | 'paid';
  endsAtMs: number;
} {
  const endsAtMs = nextBoostEndsAt(input.activeEndsAtMs, input.nowMs);
  if (usableFounderBoosts(input.wallet, input.nowMs) > 0 && input.wallet) {
    return {
      source: 'founder',
      endsAtMs,
      wallet: { ...input.wallet, remaining: input.wallet.remaining - 1 },
    };
  }
  return { source: 'paid', endsAtMs, wallet: input.wallet };
}

export function forgetFounderBoostsOnDeletion(
  wallets: FounderBoostWallet[],
  userId: string
): FounderBoostWallet[] {
  return wallets.filter((wallet) => wallet.userId !== userId);
}

/**
 * Fondateur inscrit après le crédit global : 2 Boosts, une seule fois,
 * échéance 6 mois après son inscription.
 */
export function creditFounderJoiningAfterLaunch(input: {
  userId: string;
  launchAlreadyCredited: boolean;
  alreadyCredited: boolean;
  signedUpAt: Date;
}): FounderBoostWallet | null {
  if (!input.launchAlreadyCredited || input.alreadyCredited) return null;
  return {
    userId: input.userId,
    remaining: FOUNDER_BOOST_COUNT,
    expiresAtMs: addCalendarMonths(
      input.signedUpAt,
      FOUNDER_BOOST_VALIDITY_MONTHS
    ).getTime(),
  };
}

/** Plus aucun Boost d'un mois n'est attribué à l'inscription. */
export function grantsMonthBoostOnSignup(): false {
  return false;
}
