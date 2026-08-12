export type GeoCommune = {
  nom: string;
  code: string;
  codesPostaux: string[];
  /** Libellé affiché / stocké : « Lyon (69001) » */
  label: string;
};

export const CITY_SELECTION_REQUIRED_ERROR =
  'Veuillez sélectionner une ville valide dans la liste déroulante';

const GEO_API = 'https://geo.api.gouv.fr/communes';

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

  const res = await fetch(`${GEO_API}?${params}`, { signal });
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
}
