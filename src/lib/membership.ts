export type MembershipPlan = 'free' | 'premium' | 'founder';

export const DEFAULT_PREMIUM_PRICE_CENTS = 1999;

export interface MembershipStatus {
  user_id?: string;
  /** True si une ligne memberships existe en base pour cet utilisateur */
  membership_linked: boolean;
  plan: MembershipPlan;
  is_founder: boolean;
  founder_number: number | null;
  founder_premium_until: string | null;
  premium_until: string | null;
  has_premium: boolean;
  has_boost: boolean;
  boost_ends_at: string | null;
  founders_taken: number;
  founders_max: number;
  founders_remaining: number;
  free_daily_likes: number;
  likes_used_today: number;
  likes_remaining_today: number | null;
  can_see_who_liked: boolean;
  can_use_advanced_filters: boolean;
  unlimited_likes: boolean;
  /** Tarif Premium de référence (centimes), ex. 1999 = 19,99 € */
  premium_price_cents: number;
  premium_currency: string;
  premium_interval: string;
  /** Prix pendant la période fondateur (0 = gratuit) */
  founder_trial_price_cents: number;
  founder_premium_months: number;
  /** True si actuellement en période fondateur à 0 € */
  on_founder_trial: boolean;
  /** Prix effectivement facturé maintenant (0 en période fondateur) */
  effective_price_cents: number;
}

export const DEFAULT_MEMBERSHIP: MembershipStatus = {
  membership_linked: false,
  plan: 'free',
  is_founder: false,
  founder_number: null,
  founder_premium_until: null,
  premium_until: null,
  has_premium: false,
  has_boost: false,
  boost_ends_at: null,
  founders_taken: 0,
  founders_max: 500,
  founders_remaining: 500,
  free_daily_likes: 10,
  likes_used_today: 0,
  likes_remaining_today: 10,
  can_see_who_liked: false,
  can_use_advanced_filters: false,
  unlimited_likes: false,
  premium_price_cents: DEFAULT_PREMIUM_PRICE_CENTS,
  premium_currency: 'EUR',
  premium_interval: 'month',
  founder_trial_price_cents: 0,
  founder_premium_months: 6,
  on_founder_trial: false,
  effective_price_cents: DEFAULT_PREMIUM_PRICE_CENTS,
};

export function parseMembershipStatus(raw: unknown): MembershipStatus {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_MEMBERSHIP };
  const d = raw as Record<string, unknown>;

  const premium_price_cents =
    typeof d.premium_price_cents === 'number'
      ? d.premium_price_cents
      : DEFAULT_PREMIUM_PRICE_CENTS;

  const is_founder = Boolean(d.is_founder);
  const founder_premium_until =
    typeof d.founder_premium_until === 'string'
      ? d.founder_premium_until
      : null;
  const founderUntilActive =
    !!founder_premium_until &&
    new Date(founder_premium_until).getTime() > Date.now();

  // Filet client : si la date fondateur est encore valide, on force le flag
  // (évite un bandeau invisible quand le RPC / migration est incomplet).
  const on_founder_trial =
    Boolean(d.on_founder_trial) || (is_founder && founderUntilActive);

  const has_premium = Boolean(d.has_premium) || on_founder_trial;

  return {
    user_id: typeof d.user_id === 'string' ? d.user_id : undefined,
    membership_linked:
      d.membership_linked === true || typeof d.user_id === 'string',
    plan: (d.plan as MembershipPlan) || 'free',
    is_founder,
    founder_number:
      typeof d.founder_number === 'number' ? d.founder_number : null,
    founder_premium_until,
    premium_until:
      typeof d.premium_until === 'string' ? d.premium_until : null,
    has_premium,
    has_boost: Boolean(d.has_boost),
    boost_ends_at:
      typeof d.boost_ends_at === 'string' ? d.boost_ends_at : null,
    founders_taken:
      typeof d.founders_taken === 'number' ? d.founders_taken : 0,
    founders_max: typeof d.founders_max === 'number' ? d.founders_max : 500,
    founders_remaining:
      typeof d.founders_remaining === 'number' ? d.founders_remaining : 500,
    free_daily_likes:
      typeof d.free_daily_likes === 'number' ? d.free_daily_likes : 10,
    likes_used_today:
      typeof d.likes_used_today === 'number' ? d.likes_used_today : 0,
    likes_remaining_today:
      d.likes_remaining_today === null
        ? null
        : typeof d.likes_remaining_today === 'number'
          ? d.likes_remaining_today
          : 10,
    can_see_who_liked: Boolean(d.can_see_who_liked) || has_premium,
    can_use_advanced_filters:
      Boolean(d.can_use_advanced_filters) || has_premium,
    unlimited_likes: Boolean(d.unlimited_likes) || has_premium,
    premium_price_cents,
    premium_currency:
      typeof d.premium_currency === 'string' ? d.premium_currency : 'EUR',
    premium_interval:
      typeof d.premium_interval === 'string' ? d.premium_interval : 'month',
    founder_trial_price_cents:
      typeof d.founder_trial_price_cents === 'number'
        ? d.founder_trial_price_cents
        : 0,
    founder_premium_months:
      typeof d.founder_premium_months === 'number'
        ? d.founder_premium_months
        : 6,
    on_founder_trial,
    effective_price_cents: on_founder_trial
      ? typeof d.founder_trial_price_cents === 'number'
        ? d.founder_trial_price_cents
        : 0
      : typeof d.effective_price_cents === 'number'
        ? d.effective_price_cents
        : premium_price_cents,
  };
}

/** Formate des centimes en prix FR, ex. 1999 → « 19,99 € » */
export function formatPriceCents(
  cents: number,
  currency: string = 'EUR'
): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

/** Ex. « 19,99 € / mois » */
export function formatPremiumPriceLabel(
  cents: number,
  currency: string = 'EUR',
  interval: string = 'month'
): string {
  const amount = formatPriceCents(cents, currency);
  const period =
    interval === 'month' || interval === 'mois' ? 'mois' : interval;
  return `${amount} / ${period}`;
}

export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** True tant qu’il reste des places Membre Fondateur (numerus clausus). */
export function isFounderOfferOpen(status: {
  founders_remaining: number;
}): boolean {
  return status.founders_remaining > 0;
}

/** Alias métier : offre Fondateur encore ouverte (< 500 inscrits). */
export function isFounderAvailable(status: {
  founders_remaining: number;
}): boolean {
  return isFounderOfferOpen(status);
}

/**
 * Seuil psychologique : compteur visible seulement quand ≤ 200 places
 * restantes (à partir du 301e inscrit sur 500).
 */
export const FOUNDER_SCARCITY_REMAINING_THRESHOLD = 200;

export function shouldShowFounderScarcityCounter(status: {
  founders_remaining: number;
}): boolean {
  return (
    status.founders_remaining > 0 &&
    status.founders_remaining <= FOUNDER_SCARCITY_REMAINING_THRESHOLD
  );
}

/** Badge Fondateur (sans chiffres tant que > 200 places restantes). */
export function founderOfferBadgeLabel(status: {
  founders_remaining: number;
  founders_max: number;
}): string {
  if (status.founders_remaining <= 0) return 'Offre Fondateur épuisée';
  if (shouldShowFounderScarcityCounter(status)) {
    return `Plus que ${status.founders_remaining} places disponibles sur ${status.founders_max}`;
  }
  return 'Offre Fondateur - Accès 100% gratuit';
}

/** Sous-titre Fondateur adapté au mode silencieux / rareté. */
export function founderOfferSubtitle(status: {
  founders_remaining: number;
  founders_max: number;
}): string {
  if (status.founders_remaining <= 0) {
    return 'Les places Fondateur ont toutes été attribuées.';
  }
  if (shouldShowFounderScarcityCounter(status)) {
    return `6 mois offerts — plus que ${status.founders_remaining} places sur ${status.founders_max}.`;
  }
  return '6 mois offerts — accès 100 % gratuit, sans carte bancaire.';
}

export const MEMBERSHIP_REQUIRED_ERROR =
  "Impossible de finaliser l'inscription : aucune offre valide n'est liée à votre profil. Veuillez d'abord choisir une offre.";

/** Liberté de choix à l’échéance des mois Fondateur (aucune reconduction forcée). */
export const AFTER_FOUNDER_TITLE = "À l'échéance de vos 6 mois";

export const AFTER_FOUNDER_PERIOD_COPY =
  "Vous pourrez aussi bien interrompre votre adhésion, migrer vers l'offre Freemium que passer à l'offre Premium : il n'y a pas d'engagement. Aucune reconduction automatique, aucun prélèvement forcé : vous choisissez en toute liberté.";

const VALID_PLANS: MembershipPlan[] = ['free', 'founder', 'premium'];

export function isValidLinkedOffer(status: {
  membership_linked?: boolean;
  linked?: boolean;
  plan?: string | null;
  user_id?: string;
}): boolean {
  const linked =
    status.membership_linked === true ||
    status.linked === true ||
    typeof status.user_id === 'string';
  if (!linked) return false;
  return VALID_PLANS.includes((status.plan as MembershipPlan) || 'free');
}
