export type GeoCommune = {
  nom: string;
  code: string;
  codesPostaux: string[];
  /** Libellé affiché / stocké : « Lyon (69001) » */
  label: string;
};

export const CITY_SELECTION_REQUIRED_ERROR =
  'Sélectionne une ville valide dans la liste déroulante';

const GEO_API = 'https://geo.api.gouv.fr/communes';
const SEARCH_TIMEOUT_MS = 8000;

export function formatCommuneLabel(
  nom: string,
  codesPostaux: string[]
): string {
  const codes = codesPostaux?.length ? codesPostaux : [];
  if (codes.length === 0) return nom;
  if (codes.length === 1) return `${nom} (${codes[0]})`;
  const sorted = [...codes].sort();
  return `${nom} (${sorted[0]}–${sorted[sorted.length - 1]})`;
}

function parseCommune(raw: Record<string, unknown>): GeoCommune | null {
  const nom = typeof raw.nom === 'string' ? raw.nom : null;
  const code = typeof raw.code === 'string' ? raw.code : '';
  const codesPostaux = Array.isArray(raw.codesPostaux)
    ? raw.codesPostaux.filter((c): c is string => typeof c === 'string')
    : [];
  if (!nom) return null;
  return {
    nom,
    code,
    codesPostaux,
    label: formatCommuneLabel(nom, codesPostaux),
  };
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (typeof err === 'object' &&
      err !== null &&
      'name' in err &&
      (err as { name: string }).name === 'AbortError')
  );
}

/**
 * Reconstitue une sélection à partir d’un libellé déjà stocké
 * (ex. profil existant « Lyon (69001) »).
 * Les anciennes valeurs libre (sans CP) ne sont pas considérées valides.
 */
export function communeFromStoredLabel(location: string): GeoCommune | null {
  const trimmed = location.trim();
  if (!trimmed) return null;

  const range = trimmed.match(/^(.+?)\s*\((\d{5})[–-](\d{5})\)$/u);
  if (range) {
    const nom = range[1].trim();
    const codesPostaux = [range[2], range[3]];
    return {
      nom,
      code: '',
      codesPostaux,
      label: formatCommuneLabel(nom, codesPostaux),
    };
  }

  const single = trimmed.match(/^(.+?)\s*\((\d{5})\)$/u);
  if (single) {
    const nom = single[1].trim();
    const codesPostaux = [single[2]];
    return {
      nom,
      code: '',
      codesPostaux,
      label: formatCommuneLabel(nom, codesPostaux),
    };
  }

  return null;
}

/** Recherche communes via l’API Géo (data.gouv.fr) — sans clé API. */
export async function searchFrenchCommunes(
  query: string,
  signal?: AbortSignal
): Promise<GeoCommune[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (signal?.aborted) return [];

  const params = new URLSearchParams({
    fields: 'nom,code,codesPostaux',
    boost: 'population',
    limit: '8',
  });

  if (/^\d{2,5}$/.test(q)) {
    params.set('codePostal', q);
  } else {
    params.set('nom', q);
  }

  const local = new AbortController();
  const onParentAbort = () => local.abort();
  const timer = window.setTimeout(() => local.abort(), SEARCH_TIMEOUT_MS);
  signal?.addEventListener('abort', onParentAbort);

  try {
    const res = await fetch(`${GEO_API}?${params.toString()}`, {
      method: 'GET',
      signal: local.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error('Impossible de charger les suggestions de villes.');
    }

    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];

    const seen = new Set<string>();
    const results: GeoCommune[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const commune = parseCommune(item as Record<string, unknown>);
      if (!commune || seen.has(commune.code || commune.label)) continue;
      seen.add(commune.code || commune.label);
      results.push(commune);
    }
    return results;
  } catch (err) {
    if (isAbortError(err)) {
      if (signal?.aborted) return [];
      throw new Error('La recherche de villes a pris trop de temps. Réessaie.');
    }
    throw err instanceof Error
      ? err
      : new Error('Impossible de charger les suggestions de villes.');
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onParentAbort);
  }
}

export type GeoPoint = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;
const CENTRE_LOOKUP_CONCURRENCY = 6;
const centreCache = new Map<string, GeoPoint | null>();

function foldName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCentre(raw: unknown): GeoPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const coords = (raw as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function pickCommuneCentre(
  rows: unknown[],
  nom: string
): GeoPoint | null {
  const wanted = foldName(nom);
  let fallback: GeoPoint | null = null;
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const point = parseCentre(row.centre);
    if (!point) continue;
    if (!fallback) fallback = point;
    const rowNom = typeof row.nom === 'string' ? foldName(row.nom) : '';
    if (wanted && rowNom && (rowNom === wanted || rowNom.includes(wanted) || wanted.includes(rowNom))) {
      return point;
    }
  }
  return fallback;
}

async function fetchCommuneCentre(
  query: { codePostal?: string; nom?: string },
  signal?: AbortSignal
): Promise<GeoPoint | null> {
  if (signal?.aborted) return null;

  const params = new URLSearchParams({
    fields: 'nom,code,codesPostaux,centre',
    limit: '8',
  });
  if (query.codePostal) params.set('codePostal', query.codePostal);
  else if (query.nom) params.set('nom', query.nom);
  else return null;

  const local = new AbortController();
  const onParentAbort = () => local.abort();
  const timer = window.setTimeout(() => local.abort(), SEARCH_TIMEOUT_MS);
  signal?.addEventListener('abort', onParentAbort);

  try {
    const res = await fetch(`${GEO_API}?${params.toString()}`, {
      method: 'GET',
      signal: local.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return null;
    return pickCommuneCentre(data, query.nom || '');
  } catch (err) {
    if (isAbortError(err)) {
      if (signal?.aborted) return null;
      return null;
    }
    return null;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onParentAbort);
  }
}

/** Distance à vol d’oiseau entre deux points (km). */
export function distanceKmBetween(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Centre géographique d’une commune à partir du libellé stocké « Ville (CP) ».
 * Résultat mis en cache pour la session (filtre rayon Découvrir).
 */
export async function lookupLocationCentre(
  location: string,
  signal?: AbortSignal
): Promise<GeoPoint | null> {
  const trimmed = location.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  if (centreCache.has(key)) return centreCache.get(key) ?? null;
  if (signal?.aborted) return null;

  const commune = communeFromStoredLabel(trimmed);
  const cp = commune?.codesPostaux[0] || '';
  const nom = commune?.nom || trimmed;

  let point: GeoPoint | null = null;
  if (cp) {
    point = await fetchCommuneCentre({ codePostal: cp, nom }, signal);
  }
  if (!point && nom) {
    point = await fetchCommuneCentre({ nom }, signal);
  }

  if (!signal?.aborted) centreCache.set(key, point);
  return point;
}

export async function lookupLocationCentres(
  locations: string[],
  signal?: AbortSignal
): Promise<Map<string, GeoPoint | null>> {
  const result = new Map<string, GeoPoint | null>();
  const unique = [...new Set(locations.map((l) => l.trim()).filter(Boolean))];
  if (unique.length === 0) return result;

  let index = 0;
  const worker = async () => {
    while (index < unique.length) {
      if (signal?.aborted) return;
      const loc = unique[index++];
      result.set(loc, await lookupLocationCentre(loc, signal));
    }
  };

  const n = Math.min(CENTRE_LOOKUP_CONCURRENCY, unique.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return result;
}
