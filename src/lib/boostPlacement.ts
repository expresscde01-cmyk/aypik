/** Places réservées aux profils boostés. Même effet pour tous les Boosts. */
export const BOOST_RESERVED_SLOTS = 2;

/** Rotation horaire : le tirage ne change pas tant que l'heure ne change pas. */
export const BOOST_ROTATION_MS = 60 * 60 * 1000;

export function boostHourBucket(nowMs: number): number {
  return Math.floor(nowMs / BOOST_ROTATION_MS);
}

/** Rang stable pour un visiteur, une heure et un profil. */
export function boostRotationRank(
  viewerId: string,
  profileId: string,
  hourBucket: number
): number {
  let hash = 2166136261;
  const seed = `${viewerId}|${hourBucket}|${profileId}`;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickBoostedSlots<T extends { id: string }>(
  boosted: T[],
  viewerId: string,
  nowMs: number,
  slots = BOOST_RESERVED_SLOTS
): T[] {
  const hour = boostHourBucket(nowMs);
  return boosted
    .slice()
    .sort(
      (a, b) =>
        boostRotationRank(viewerId, a.id, hour) -
          boostRotationRank(viewerId, b.id, hour) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
    .slice(0, Math.max(0, slots));
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * Accueil : au plus 2 profils boostés en tête, puis le classement naturel.
 * `boostedPool` ne contient que des profils déjà filtrés. Un profil de ce
 * réservoir n'apparaît que s'il obtient une des 2 places.
 */
export function placeHomeSuggestions<T extends { id: string; is_boosted?: boolean }>(
  ranked: T[],
  viewerId: string,
  nowMs: number,
  visible: number,
  boostedPool?: T[]
): T[] {
  const chosen = pickBoostedSlots(
    uniqueById(
      [...ranked, ...(boostedPool ?? [])].filter((item) => item.is_boosted)
    ),
    viewerId,
    nowMs
  );
  const chosenIds = new Set(chosen.map((item) => item.id));
  const rest = ranked.filter((item) => !chosenIds.has(item.id));
  return [...chosen, ...rest].slice(0, Math.max(0, visible));
}

/**
 * Découvrir sans tri : au plus 2 profils boostés en tête de leur groupe.
 * Un profil ne change pas de groupe. `boostedPool` ne contient que des
 * profils déjà filtrés ; hors des 2 places, il n'est pas inséré.
 */
export function placeBoostsAtGroupHead<
  T extends { id: string; is_boosted?: boolean },
>(
  ordered: T[],
  groupKey: (item: T) => number,
  viewerId: string,
  nowMs: number,
  slots = BOOST_RESERVED_SLOTS,
  boostedPool?: T[]
): T[] {
  type Segment = { key: number; members: T[]; boosted: T[] };
  const segments: Segment[] = [];
  const byKey = new Map<number, Segment>();
  const segmentFor = (key: number): Segment => {
    let segment = byKey.get(key);
    if (!segment) {
      segment = { key, members: [], boosted: [] };
      byKey.set(key, segment);
      segments.push(segment);
    }
    return segment;
  };

  let index = 0;
  while (index < ordered.length) {
    const key = groupKey(ordered[index]);
    let end = index + 1;
    while (end < ordered.length && groupKey(ordered[end]) === key) end += 1;
    const segment = segmentFor(key);
    const group = ordered.slice(index, end);
    segment.members.push(...group);
    for (const item of group) {
      if (item.is_boosted) segment.boosted.push(item);
    }
    index = end;
  }

  const orderedIds = new Set(ordered.map((item) => item.id));
  for (const item of boostedPool ?? []) {
    if (!item.is_boosted || orderedIds.has(item.id)) continue;
    const segment = segmentFor(groupKey(item));
    if (!segment.boosted.some((entry) => entry.id === item.id)) {
      segment.boosted.push(item);
    }
  }

  segments.sort((a, b) => a.key - b.key);

  const out: T[] = [];
  for (const segment of segments) {
    const chosen = pickBoostedSlots(segment.boosted, viewerId, nowMs, slots);
    const chosenIds = new Set(chosen.map((item) => item.id));
    out.push(
      ...chosen,
      ...segment.members.filter((item) => !chosenIds.has(item.id))
    );
  }
  return out;
}
