/** Hauteur de repli = `h-14` du header Mes Matchs. */
export const STICKY_HEADER_FALLBACK_PX = 56;
export const STICKY_HEADER_GAP_PX = 8;

export function measureStickyHeaderHeight(
  header: { getBoundingClientRect: () => { height: number } } | null,
  fallback = STICKY_HEADER_FALLBACK_PX
): number {
  const height = header?.getBoundingClientRect().height ?? 0;
  return height > 0 ? height : fallback;
}

/**
 * `scrollIntoView({ block: 'start' })` ignore le header sticky : la cible
 * se cale à y=0 et passe sous la barre. On vise juste en dessous.
 */
export function scrollYUnderStickyHeader(
  elementTopInViewport: number,
  pageYOffset: number,
  stickyHeight: number,
  gap = STICKY_HEADER_GAP_PX
): number {
  return Math.max(0, elementTopInViewport + pageYOffset - stickyHeight - gap);
}

export function queryStickyHeader(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector('header.sticky');
}

/**
 * Remonte au bloc d’étage (Pendant / Avant / Après) quand la catégorie
 * visée est la première du bloc — pour garder titre + badge + cartes.
 * Sinon, la section de catégorie (badge + cartes).
 */
export function resolveMatchFocusScrollTarget(
  el: {
    closest: (selector: string) => unknown;
  } | null
): unknown {
  if (!el) return null;
  const stage = el.closest('[data-match-stage]') as {
    querySelector?: (selector: string) => { firstElementChild?: unknown } | null;
  } | null;
  const floor =
    el.closest('section[id^="match-floor-"]') || el.closest('section');
  if (stage && floor && typeof stage.querySelector === 'function') {
    const inner = stage.querySelector(':scope > div');
    if (inner?.firstElementChild === floor) return stage;
  }
  return floor || stage || el;
}
