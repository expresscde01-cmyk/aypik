import { SITE_FREE_MODE } from '@/lib/founderCopy';

export type DiscoverMode = 'detaille' | 'simplifie';

export function parseDiscoverMode(value: unknown): DiscoverMode {
  return value === 'simplifie' ? 'simplifie' : 'detaille';
}

export function isSimplifiedDiscoverMode(value: unknown): boolean {
  return parseDiscoverMode(value) === 'simplifie';
}

/** Confort et Premium : le mode Détaillé fait partie du confort payé. */
export function planIncludesDetailedDiscover(
  plan: string | null | undefined
): boolean {
  return plan === 'confort' || plan === 'premium';
}

/**
 * Pendant le lancement (SITE_FREE_MODE), tout le monde garde les deux modes.
 * En mode payant, Détaillé est réservé à Confort et Premium.
 */
export function detailedDiscoverAllowed(
  plan: string | null | undefined,
  siteFreeMode: boolean
): boolean {
  if (siteFreeMode) return true;
  return planIncludesDetailedDiscover(plan);
}

export function canUseDetailedDiscoverMode(status?: {
  plan?: string | null;
} | null): boolean {
  return detailedDiscoverAllowed(status?.plan, SITE_FREE_MODE);
}

/**
 * Gratuit, Basique et Essentiel, une fois le site payant : Simplifié forcé.
 * La valeur enregistrée n'est pas réécrite, pour qu'un passage à Confort
 * ou Premium rouvre Détaillé (le défaut) si la personne ne l'avait pas quitté.
 */
export function resolveDiscoverMode(
  stored: unknown,
  plan: string | null | undefined,
  siteFreeMode: boolean,
  membershipLoading = false
): DiscoverMode {
  if (membershipLoading) return parseDiscoverMode(stored);
  if (!detailedDiscoverAllowed(plan, siteFreeMode)) return 'simplifie';
  return parseDiscoverMode(stored);
}

export function effectiveDiscoverMode(
  stored: unknown,
  status?: { plan?: string | null } | null,
  membershipLoading = false
): DiscoverMode {
  return resolveDiscoverMode(
    stored,
    status?.plan,
    SITE_FREE_MODE,
    membershipLoading
  );
}
