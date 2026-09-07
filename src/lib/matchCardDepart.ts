/** Classe unique de sortie de fiche (Mes Matchs). */
export const MATCH_CARD_DEPART_CLASS = 'match-card-departing';
export const MATCH_CARD_DEPART_MS = 420;

export function matchCardDepartClass(base: string, departing: boolean): string {
  if (!departing) return base;
  const withoutFadeIn = base.replace(/\banimate-fadeIn\b/g, '').replace(/\s+/g, ' ').trim();
  return `${withoutFadeIn} ${MATCH_CARD_DEPART_CLASS}`.trim();
}

export function matchCardDepartDurationMs(reducedMotion?: boolean): number {
  const reduce =
    reducedMotion ??
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  return reduce ? 0 : MATCH_CARD_DEPART_MS;
}

export function waitMatchCardDepart(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Pendant l’anim, un reload ne doit pas déplacer la fiche vers la rubrique d’arrivée. */
export function retainDepartingMatches<T extends { profile: { id: string } }>(
  prev: T[],
  next: T[],
  departingIds: ReadonlySet<string>
): T[] {
  if (departingIds.size === 0) return next;
  const nextIds = new Set(next.map((item) => item.profile.id));
  const kept = next.map((item) => {
    if (!departingIds.has(item.profile.id)) return item;
    return prev.find((row) => row.profile.id === item.profile.id) ?? item;
  });
  for (const row of prev) {
    if (departingIds.has(row.profile.id) && !nextIds.has(row.profile.id)) {
      kept.push(row);
    }
  }
  return kept;
}

/** Laisse l’overlay se fermer pour que la fiche soit visible pendant l’animation. */
export function afterMatchCardOverlayClose(): Promise<void> {
  if (
    typeof window === 'undefined' ||
    typeof requestAnimationFrame !== 'function'
  ) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
