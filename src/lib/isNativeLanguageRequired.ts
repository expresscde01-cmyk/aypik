import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { isFrancophoneCountry } from '@/lib/francophoneCountries';
import type { MembershipPlan } from '@/lib/membership';

export type NativeLanguagePlanInput = {
  plan?: MembershipPlan | string | null;
  has_international_access?: boolean;
  international_until?: string | null;
  /** Forfait en cours de souscription (checkout). */
  subscribing?: 'international' | 'premium' | null;
};

/**
 * Langue maternelle obligatoire :
 * (a) profil hors pays/territoires francophones ;
 * (b) souscription d’un forfait Premium ou International (checkout).
 *
 * En lancement (SITE_FREE_MODE), (b) ne s’applique pas aux comptes existants
 * même si la recherche internationale est ouverte à tous : uniquement au
 * moment du checkout Premium / International. Après le lancement, (b)
 * s’étend aussi au forfait Premium ou à l’option International déjà actifs.
 */
export function isNativeLanguageRequired(
  profile: { country_code?: string | null },
  plan: NativeLanguagePlanInput = {}
): boolean {
  if (!isFrancophoneCountry(profile.country_code)) return true;
  if (plan.subscribing === 'international' || plan.subscribing === 'premium') {
    return true;
  }
  if (SITE_FREE_MODE) return false;
  if (plan.plan === 'premium') return true;
  if (plan.has_international_access) return true;
  if (plan.international_until) return true;
  return false;
}

export function checkoutNeedsNativeLanguage(
  plan: string | null | undefined
): boolean {
  return plan === 'international' || plan === 'premium';
}
