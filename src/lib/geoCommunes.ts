export type CommuneSuggestion = {
  code: string;
  nom: string;
  codesPostaux: string[];
  label: string;
};

function isPostalCodeQuery(query: string): boolean {
  return /^\d{2,5}$/.test(query.trim());
}

function buildLabel(nom: string, codesPostaux: string[]): string {
  const cp = codesPostaux[0];
  return cp ? `${nom} (${cp})` : nom;
}

export async function searchCommunes(
  query: string,
  signal?: AbortSignal
): Promise<CommuneSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({
    fields: 'nom,code,codesPostaux',
    boost: 'population',
    limit: '12',
  });

  if (isPostalCodeQuery(q)) {
    params.set('codePostal', q);
  } else {
    params.set('nom', q);
  }

  const res = await fetch(
    `https://geo.api.gouv.fr/communes?${params.toString()}`,
    { signal }
  );

  if (!res.ok) {
    throw new Error('Impossible de charger les villes.');
  }

  const data = (await res.json()) as Array<{
    code: string;
    nom: string;
    codesPostaux?: string[];
  }>;

  return data.map((item) => {
    const codesPostaux = item.codesPostaux ?? [];
    return {
      code: item.code,
      nom: item.nom,
      codesPostaux,
      label: buildLabel(item.nom, codesPostaux),
    };
  });
}
