/**
 * Overlay plein écran au-dessus de la cloche : le pointerdown ferme le panneau,
 * puis le click (surtout mobile, ~300 ms plus tard) retombe sur le bouton
 * et le rouvrirait. On ignore ce click tant que `until` n’est pas dépassé.
 */
export const BELL_GHOST_CLICK_MS = 500;

export function ghostClickIgnoreUntil(
  now: number,
  overlayHitsBell: boolean
): number | null {
  return overlayHitsBell ? now + BELL_GHOST_CLICK_MS : null;
}

export function shouldIgnoreBellClick(ignoreUntil: number, now: number): boolean {
  return now < ignoreUntil;
}
