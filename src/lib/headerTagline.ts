export const HEADER_TAGLINE_SM_MAX_PX = 639;
export const HEADER_TAGLINE_HYSTERESIS_PX = 12;
export const HEADER_TAGLINE_MEASURE_DEBOUNCE_MS = 100;

export function taglineNeedsCompact({
  viewportBelowSm,
  availablePx,
  neededPx,
  currentlyCompact,
}: {
  viewportBelowSm: boolean;
  availablePx: number;
  neededPx: number;
  currentlyCompact: boolean;
}): boolean {
  if (viewportBelowSm) return true;
  if (neededPx <= 0 || availablePx <= 0) return currentlyCompact;
  if (currentlyCompact) {
    return neededPx > availablePx - HEADER_TAGLINE_HYSTERESIS_PX;
  }
  return neededPx > availablePx;
}
