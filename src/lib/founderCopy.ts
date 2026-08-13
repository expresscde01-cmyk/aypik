/**
 * Mode site entièrement gratuit (Fondateur / FREE).
 * Passer à `false` pour restaurer l’UI payante : encart « Après vos 6 mois »,
 * cartes Premium/Boost, prix landing, teasers et CGU tarifaires.
 */
export const SITE_FREE_MODE: boolean = true;

/** Numerus clausus Fondateur (aligné sur platform_settings.founder_max_slots). */
export const FOUNDER_MAX_SLOTS = 500;

export const FOUNDER_SLOTS_SUBTITLE = `6 mois offerts — Offre exclusive réservée aux ${FOUNDER_MAX_SLOTS} premiers membres.`;

export const FOUNDER_BENEFIT_NO_CARD = 'Inscription sans carte bancaire';
export const FOUNDER_BENEFIT_UNLIMITED_LIKES = 'Likes illimités';
export const FOUNDER_BENEFIT_BOOST_FIRST_MONTH =
  'Boost profil offert le 1er mois';
export const FOUNDER_BENEFIT_FLASH =
  'Coup de cœur offert (notification immédiate)';

/**
 * Copies de l’encart « Après vos 6 mois offerts ».
 * Conservées pour restaurer le mode payant ; C est le dernier corps validé.
 */
export const FOUNDER_AFTER_6_MONTHS_COPY_A =
  'Vous pourrez ensuite migrer de votre statut de Membre Fondateur vers l’offre Freemium, ou choisir de soutenir la communauté avec l’offre Premium à 19,99 € / mois. Aucune carte bancaire n’est jamais demandée.';

export const FOUNDER_AFTER_6_MONTHS_COPY_B =
  'Vous restez libre d’annuler en 1 clic, de migrer vers l’offre Freemium ou de soutenir la communauté avec l’offre Premium à 19,99 € / mois. Aucune obligation.';

export const FOUNDER_AFTER_6_MONTHS_COPY_C =
  "Vous restez libre d'annuler en 1 clic, de migrer vers l’offre Freemium ou de soutenir la communauté avec l’offre Premium à 19,99 € / mois. Les offres sur AYPIK sont sans engagement de durée.";

/** Dernier corps validé — à réafficher dans l’encart après 6 mois. */
export const FOUNDER_AFTER_6_MONTHS_BODY = FOUNDER_AFTER_6_MONTHS_COPY_C;

/** Statut minimal pour nommer l’offre choisie à l’inscription. */
export type OfferStatusLike = {
  is_founder?: boolean;
  plan?: string | null;
  on_founder_trial?: boolean;
  founder_premium_until?: string | null;
};

export type OfferLabel =
  | "l'offre Fondateur"
  | 'le freemium'
  | "l'offre Premium";

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
export function offerLabel(status: OfferStatusLike): OfferLabel {
  if (isFounderOffer(status)) return "l'offre Fondateur";
  if (status.plan === 'premium') return "l'offre Premium";
  return 'le freemium';
}

/** Nom court pour badges / listes : Fondateur | Freemium | Premium */
export function offerShortName(
  status: OfferStatusLike
): 'Fondateur' | 'Freemium' | 'Premium' {
  if (isFounderOffer(status)) return 'Fondateur';
  if (status.plan === 'premium') return 'Premium';
  return 'Freemium';
}

/** Archive nommée (A = git, B = utilisateur, C = dernier validé). */
export const FOUNDER_AFTER_6_MONTHS_ARCHIVE = {
  A: FOUNDER_AFTER_6_MONTHS_COPY_A,
  B: FOUNDER_AFTER_6_MONTHS_COPY_B,
  C: FOUNDER_AFTER_6_MONTHS_COPY_C,
} as const;
