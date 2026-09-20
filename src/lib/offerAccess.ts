import {
  isFounderPrivilegeActive,
  type OfferStatusLike,
} from '@/lib/founderCopy';
import {
  locationLacksLandNeighbors,
  type GeoPerimeterFilter,
} from '@/lib/geoProximity';
import type { MembershipPlan, MembershipStatus } from '@/lib/membership';
import {
  DEFAULT_SUGGESTION_PREFS,
  type SuggestionPrefs,
} from '@/lib/suggestionPrefs';

/** Paliers payants du cahier v3 (hors Fondateur). */
export const PAID_TIER_PLANS = [
  'basique',
  'essentiel',
  'confort',
  'premium',
] as const;

export type PaidTierPlan = (typeof PAID_TIER_PLANS)[number];

/** Destinataire joignable sans Match. */
export const OPEN_PROFILE_PLANS: readonly MembershipPlan[] = [
  'free',
  'basique',
  'essentiel',
];

export const DEFAULT_BASIQUE_PRICE_CENTS = 999;

export const LIKE_QUOTA = {
  free: 5,
  basique: 7,
  essentiel: 10,
} as const;

export const FLASH_QUOTA = {
  free: 2,
  basique: 2,
  essentiel: 3,
} as const;

export function isPaidTierPlan(plan: string | null | undefined): plan is PaidTierPlan {
  return (
    plan === 'basique' ||
    plan === 'essentiel' ||
    plan === 'confort' ||
    plan === 'premium'
  );
}

export function isOpenProfilePlan(plan: string | null | undefined): boolean {
  return (
    plan === 'free' ||
    plan === 'basique' ||
    plan === 'essentiel' ||
    !plan
  );
}

/** Confort / Premium : Dialogue seulement avec un Match. */
export function isProtectedProfilePlan(plan: string | null | undefined): boolean {
  return plan === 'confort' || plan === 'premium';
}

function paidPlanStillActive(
  status: Pick<MembershipStatus, 'plan' | 'premium_until'>
): boolean {
  if (!status.premium_until) return true;
  return new Date(status.premium_until).getTime() > Date.now();
}

export function canPersonalizeSearch(
  status: Pick<MembershipStatus, 'plan' | 'premium_until'> & OfferStatusLike
): boolean {
  if (isFounderPrivilegeActive(status)) return true;
  if (
    status.plan === 'essentiel' ||
    status.plan === 'confort' ||
    status.plan === 'premium'
  ) {
    return paidPlanStillActive(status);
  }
  return false;
}

export function canSeeWhoLiked(
  status: Pick<MembershipStatus, 'plan'> & OfferStatusLike
): boolean {
  if (isFounderPrivilegeActive(status)) return true;
  return status.plan === 'confort' || status.plan === 'premium';
}

export function hasUnlimitedLikesFlashes(
  status: Pick<MembershipStatus, 'plan'> & OfferStatusLike
): boolean {
  if (isFounderPrivilegeActive(status)) return true;
  return status.plan === 'confort' || status.plan === 'premium';
}

export function dailyLikeQuota(
  status: Pick<MembershipStatus, 'plan'> & OfferStatusLike
): number | null {
  if (hasUnlimitedLikesFlashes(status)) return null;
  if (status.plan === 'essentiel') return LIKE_QUOTA.essentiel;
  if (status.plan === 'basique') return LIKE_QUOTA.basique;
  return LIKE_QUOTA.free;
}

export function dailyFlashQuota(
  status: Pick<MembershipStatus, 'plan'> & OfferStatusLike
): number | null {
  if (hasUnlimitedLikesFlashes(status)) return null;
  if (status.plan === 'essentiel') return FLASH_QUOTA.essentiel;
  if (status.plan === 'basique') return FLASH_QUOTA.basique;
  return FLASH_QUOTA.free;
}

export function canBuyAddons(
  status: Pick<MembershipStatus, 'plan' | 'premium_until'> & OfferStatusLike
): boolean {
  if (isFounderPrivilegeActive(status)) return true;
  if (
    status.plan === 'essentiel' ||
    status.plan === 'confort' ||
    status.plan === 'premium'
  ) {
    return paidPlanStillActive(status);
  }
  return false;
}

export function canBuyBoost(
  status: Pick<MembershipStatus, 'plan' | 'premium_until'> & OfferStatusLike
): boolean {
  return canBuyAddons(status);
}

/** National = périmètre FRANCE (`anywhere`). */
export function lockedGeoPerimeter(
  plan: string | null | undefined,
  location?: string | null
): GeoPerimeterFilter {
  if (plan === 'basique') return 'anywhere';
  if (locationLacksLandNeighbors(location)) return 'anywhere';
  return 'neighboring_region';
}

/**
 * Prefs réellement appliquées à Découvrir / Accueil.
 * Gratuit et Basique : valeurs figées, y compris si le client envoie autre chose.
 */
export function effectiveSuggestionPrefs(
  status: Pick<
    MembershipStatus,
    | 'plan'
    | 'premium_until'
    | 'has_francophone_access'
    | 'has_international_access'
  > &
    OfferStatusLike,
  prefs: SuggestionPrefs,
  location?: string | null
): SuggestionPrefs {
  if (!canPersonalizeSearch(status)) {
    return {
      ...DEFAULT_SUGGESTION_PREFS,
      minOverlap: 0,
      geoPerimeter: lockedGeoPerimeter(status.plan, location),
      geoExclusive: false,
      worldZones: [],
      internationalCountries: [],
      franceWorldChoice: 'all',
      franceWorldCodes: [],
      temperamentFilter: {},
      languageCodes: [],
      minLanguageLevel: 'all',
    };
  }

  let geoPerimeter = prefs.geoPerimeter;
  if (geoPerimeter === 'international' && !status.has_international_access) {
    geoPerimeter = status.has_francophone_access
      ? 'la_france_dans_le_monde'
      : 'anywhere';
  }
  if (
    geoPerimeter === 'la_france_dans_le_monde' &&
    !status.has_francophone_access &&
    !status.has_international_access
  ) {
    geoPerimeter = 'anywhere';
  }

  return {
    ...prefs,
    geoPerimeter,
    minOverlap: prefs.minOverlap,
  };
}
