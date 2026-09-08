import { supabase } from '@/lib/supabase';

export type WorldCityHit = {
  geonameId: number;
  nom: string;
  label: string;
  countryCode: string;
  lat: number;
  lng: number;
  population: number;
  codesPostaux: string[];
  code: string;
};

export async function searchWorldCities(
  countryCode: string,
  query: string,
  signal?: AbortSignal
): Promise<WorldCityHit[]> {
  const country = countryCode.trim().toUpperCase();
  const q = query.trim();
  if (!country || q.length < 2) return [];

  const { data, error } = await supabase.rpc('search_world_cities', {
    p_country: country,
    p_query: q,
    p_limit: 15,
  });
  if (signal?.aborted) return [];
  if (error) {
    throw new Error(error.message || 'Impossible de charger les villes.');
  }

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((raw) => {
      const row = raw as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name : '';
      const iso = typeof row.country_code === 'string' ? row.country_code : country;
      const geonameId = Number(row.geoname_id);
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!name || !Number.isFinite(geonameId)) return null;
      return {
        geonameId,
        nom: name,
        label: name,
        countryCode: iso,
        lat: Number.isFinite(lat) ? lat : 0,
        lng: Number.isFinite(lng) ? lng : 0,
        population: Number(row.population) || 0,
        codesPostaux: [] as string[],
        code: String(geonameId),
      };
    })
    .filter((row): row is WorldCityHit => row !== null);
}
