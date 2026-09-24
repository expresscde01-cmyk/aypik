import { t } from '../i18n/t.ts';

/**
 * Mode site entièrement gratuit (Fondateur / FREE).
 * Passer à `false` pour restaurer l’UI payante : encart « Après tes 6 mois »,
 * cartes Premium/Boost, prix landing, teasers et CGU tarifaires.
 *
 * La bascule produit vers le payant est liée à l’attribution du 1000e numéro
 * Fondateur, pas à une date calendaire. Elle est définitive. Elle reste manuelle
 * ici : ne pas inverser ce flag automatiquement si le seuil n’est pas atteint.
 */
export const SITE_FREE_MODE: boolean = true;

/** Numerus clausus Fondateur (aligné sur platform_settings.founder_max_slots). */
export const FOUNDER_MAX_SLOTS = 1000;

export function founderSlotsSubtitle(): string {
  return t('landing.founderSlotsSubtitle', { maxSlots: FOUNDER_MAX_SLOTS });
}

/** Landing, bandeau, carte condensée — une fois le numerus clausus atteint. */
export function founderOfferClosedShort(): string {
  return t('landing.founderOfferClosed');
}

/** CGU article 4.1 — paragraphe de clôture, une fois le seuil atteint. */
export function founderOfferClosedLegal(): string {
  return t('legal.founderOfferClosed');
}

export function founderOfferShortMessage(closed: boolean): string {
  return closed ? founderOfferClosedShort() : founderSlotsSubtitle();
}

export function founderBenefitNoCard(): string {
  return t('landing.founderBenefitNoCard');
}

export function founderBenefitUnlimitedLikes(): string {
  return t('landing.founderBenefitLikes');
}

export function founderBenefitBoostFirstMonth(): string {
  return t('landing.founderBenefitBoost');
}

export function founderBenefitLifetimeDiscount(): string {
  return t('landing.founderBenefitLifetimeDiscount');
}

export function founderBenefitFlash(): string {
  return t('landing.founderBenefitFlash');
}

/**
 * Copies de l’encart « Après tes 6 mois offerts ».
 * Conservées pour restaurer le mode payant ; C est le dernier corps validé.
 */
export const FOUNDER_AFTER_6_MONTHS_COPY_A =
  'Tu pourras ensuite migrer de ton statut de Membre Fondateur vers l’offre Freemium, ou choisir de soutenir la communauté avec l’offre Premium à 19,99 € / mois. Aucune carte bancaire n’est jamais demandée.';

export const FOUNDER_AFTER_6_MONTHS_COPY_B =
  'Tu restes libre d’annuler en 1 clic, de migrer vers l’offre Freemium ou de soutenir la communauté avec l’offre Premium à 19,99 € / mois. Aucune obligation.';

export function founderAfter6MonthsCopyC(price: string): string {
  return t('landing.after6MonthsBody', { price });
}

/** Dernier corps validé — à réafficher dans l’encart après 6 mois. */
export function founderAfter6MonthsBody(price: string): string {
  return t('landing.after6MonthsBody', { price });
}

/** Statut minimal pour nommer l’offre choisie à l’inscription. */
export type OfferStatusLike = {
  is_founder?: boolean;
  plan?: string | null;
  on_founder_trial?: boolean;
  founder_premium_until?: string | null;
};

export function isFounderOffer(status: OfferStatusLike): boolean {
  return Boolean(
    status.is_founder ||
      status.plan === 'founder' ||
      status.on_founder_trial
  );
}

/**
 * Privilèges Fondateur (likes, flash, boost offert) : uniquement pendant
 * founder_premium_until. Le titre is_founder reste honorifique ensuite.
 */
export function isFounderPrivilegeActive(status?: OfferStatusLike): boolean {
  if (!status) return false;
  if (status.on_founder_trial) return true;
  const until = status.founder_premium_until;
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

/**
 * Libellé d’offre dans l’app connectée — toujours celui choisi à l’inscription.
 * Fondateur : jamais « le freemium ».
 */
export function offerLabel(status: OfferStatusLike): string {
  if (isFounderOffer(status)) return t('common.offer.fondateur');
  if (status.plan === 'premium') return t('common.offer.premium');
  if (status.plan === 'confort') return t('common.offer.confort');
  if (status.plan === 'essentiel') return t('common.offer.essentiel');
  if (status.plan === 'basique') return t('common.offer.basique');
  return t('common.offer.freemium');
}

/** Nom court pour badges / listes : Fondateur | Freemium | Essentiel | Confort | Premium */
export function offerShortName(status: OfferStatusLike): string {
  if (isFounderOffer(status)) return t('common.offer.shortFondateur');
  if (status.plan === 'premium') return t('common.offer.shortPremium');
  if (status.plan === 'confort') return t('common.offer.shortConfort');
  if (status.plan === 'essentiel') return t('common.offer.shortEssentiel');
  if (status.plan === 'basique') return t('common.offer.shortBasique');
  return t('common.offer.shortFreemium');
}

/** Archive nommée (A = git, B = utilisateur, C = dernier validé). */
export function founderAfter6MonthsArchive(price = ''): {
  A: string;
  B: string;
  C: string;
} {
  return {
    A: FOUNDER_AFTER_6_MONTHS_COPY_A,
    B: FOUNDER_AFTER_6_MONTHS_COPY_B,
    C: founderAfter6MonthsCopyC(price),
  };
}
