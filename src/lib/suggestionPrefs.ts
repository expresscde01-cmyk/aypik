import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GEO_RADIUS_KM_DEFAULT,
  isGeoPerimeterFilter,
  geoExclusiveApplies,
  isGeoRadiusKm,
  type GeoPerimeterFilter,
  type GeoRadiusKm,
} from '@/lib/geoProximity';

export type SuggestionPrefs = {
  geoPerimeter: GeoPerimeterFilter;
  geoRadiusKm: GeoRadiusKm;
  /** Strate étanche dès Même département. Inactif sur Même ville, quarts, Île-de-France et PARTOUT. */
  geoExclusive: boolean;
  /** 0 = pas de minimum d’intérêts. Défaut produit : 1. */
  minOverlap: number;
};

/** Première visite / rien de configuré : jusqu’aux régions voisines + au moins 1 intérêt. */
export const DEFAULT_SUGGESTION_PREFS: SuggestionPrefs = {
  geoPerimeter: 'neighboring_region',
  geoRadiusKm: GEO_RADIUS_KM_DEFAULT,
  geoExclusive: false,
  minOverlap: 1,
};

const PREFS_EVENT = 'aypik-suggestion-prefs';

function storageKey(userId: string) {
  return `aypik:suggestion-prefs:${userId}`;
}

/** État affiché sur Découvrir (même non modifié). Source pour la flush à la sortie. */
let discoverLive: { userId: string; prefs: SuggestionPrefs } | null = null;

/** Publie l’état courant des filtres Découvrir (à chaque rendu / changement). */
export function syncDiscoverPrefs(userId: string, prefs: SuggestionPrefs): void {
  discoverLive = { userId, prefs: parseSuggestionPrefs(prefs) };
}

export function setSuggestionPrefsDraft(
  userId: string,
  prefs: SuggestionPrefs
): void {
  syncDiscoverPrefs(userId, prefs);
}

/**
 * Valide et enregistre les filtres Découvrir comme modèle Accueil.
 * Utilise l’état live de Découvrir s’il existe, sinon le dernier enregistrement.
 * Ne jamais no-op : Accueil doit pouvoir relire un état persisté.
 */
export function flushDiscoverPrefs(userId?: string | null): SuggestionPrefs | null {
  if (!userId) return null;
  const prefs =
    discoverLive && discoverLive.userId === userId
      ? discoverLive.prefs
      : loadSuggestionPrefs(userId);
  saveSuggestionPrefs(userId, prefs);
  return prefs;
}

export function commitSuggestionPrefsDraft(
  userId?: string | null
): SuggestionPrefs | null {
  return flushDiscoverPrefs(userId);
}

function parseMinOverlap(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 3) {
    return DEFAULT_SUGGESTION_PREFS.minOverlap;
  }
  return n;
}

export function parseSuggestionPrefs(raw: unknown): SuggestionPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SUGGESTION_PREFS };
  const d = raw as Record<string, unknown>;
  const rawPerimeter = String(d.geoPerimeter || '');
  const geoPerimeter =
    rawPerimeter === 'radius'
      ? 'neighboring_region'
      : isGeoPerimeterFilter(rawPerimeter)
        ? rawPerimeter
        : DEFAULT_SUGGESTION_PREFS.geoPerimeter;
  const radiusNum = Number(d.geoRadiusKm);
  const geoRadiusKm = isGeoRadiusKm(radiusNum)
    ? radiusNum
    : DEFAULT_SUGGESTION_PREFS.geoRadiusKm;
  return {
    geoPerimeter,
    geoRadiusKm,
    geoExclusive:
      d.geoExclusive === true && geoExclusiveApplies(geoPerimeter),
    minOverlap: parseMinOverlap(d.minOverlap),
  };
}

export function loadSuggestionPrefs(
  userId: string | null | undefined
): SuggestionPrefs {
  if (!userId || typeof localStorage === 'undefined') {
    return { ...DEFAULT_SUGGESTION_PREFS };
  }
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { ...DEFAULT_SUGGESTION_PREFS };
    return parseSuggestionPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SUGGESTION_PREFS };
  }
}

export function saveSuggestionPrefs(
  userId: string,
  prefs: SuggestionPrefs
): void {
  const next = parseSuggestionPrefs(prefs);
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    /* quota */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(PREFS_EVENT, { detail: { userId, prefs: next } })
    );
  }
}

export function subscribeSuggestionPrefs(
  userId: string,
  onChange: (prefs: SuggestionPrefs) => void
): () => void {
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent).detail as
      | { userId?: string; prefs?: SuggestionPrefs }
      | undefined;
    if (detail?.userId !== userId || !detail.prefs) return;
    onChange(parseSuggestionPrefs(detail.prefs));
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey(userId)) return;
    onChange(loadSuggestionPrefs(userId));
  };
  window.addEventListener(PREFS_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PREFS_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSuggestionPrefs(
  userId: string | undefined,
  options?: { listen?: boolean; persistOnChange?: boolean }
) {
  const listen = options?.listen ?? true;
  const persistOnChange = options?.persistOnChange ?? true;
  const hydratedUser = useRef<string | undefined>(undefined);
  const [prefs, setPrefsState] = useState<SuggestionPrefs>(() =>
    loadSuggestionPrefs(userId)
  );

  useEffect(() => {
    if (!userId) {
      hydratedUser.current = undefined;
      setPrefsState({ ...DEFAULT_SUGGESTION_PREFS });
      return;
    }
    if (hydratedUser.current !== userId) {
      hydratedUser.current = userId;
      setPrefsState(loadSuggestionPrefs(userId));
    }
    if (!listen) return;
    return subscribeSuggestionPrefs(userId, setPrefsState);
  }, [userId, listen]);

  const setPrefs = useCallback(
    (
      next: SuggestionPrefs | ((prev: SuggestionPrefs) => SuggestionPrefs)
    ) => {
      setPrefsState((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        const parsed = parseSuggestionPrefs(resolved);
        if (userId) syncDiscoverPrefs(userId, parsed);
        if (userId && persistOnChange) saveSuggestionPrefs(userId, parsed);
        return parsed;
      });
    },
    [userId, persistOnChange]
  );

  return [prefs, setPrefs] as const;
}
