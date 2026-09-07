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
