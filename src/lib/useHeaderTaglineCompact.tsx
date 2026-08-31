import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  BRAND_BASELINE,
  BRAND_NAME,
  BRAND_SHORT_TAGLINE_TEXT,
} from '@/components/BrandLockup';
import {
  HEADER_TAGLINE_MEASURE_DEBOUNCE_MS,
  HEADER_TAGLINE_SM_MAX_PX,
  taglineFits,
  taglineNeedsCompact,
} from '@/lib/headerTagline';

export function useHeaderTaglineCompact(): {
  compact: boolean;
  rowRef: RefObject<HTMLDivElement>;
  rightRef: RefObject<HTMLDivElement>;
  probeRef: RefObject<HTMLDivElement>;
} {
  const rowRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef(true);
  const [compact, setCompact] = useState(true);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const right = rightRef.current;
    const probe = probeRef.current;
    if (!row || !right || !probe) return;

    const apply = () => {
      const viewportBelowSm = window.innerWidth <= HEADER_TAGLINE_SM_MAX_PX;
      const styles = window.getComputedStyle(row);
      const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
      const availablePx = row.clientWidth - right.offsetWidth - gap;
      const neededPx = probe.offsetWidth;
      const next = taglineNeedsCompact({
        viewportBelowSm,
        availablePx,
        neededPx,
        currentlyCompact: compactRef.current,
      });
      if (next === compactRef.current) return;
      compactRef.current = next;
      setCompact(next);
    };

    apply();

    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, HEADER_TAGLINE_MEASURE_DEBOUNCE_MS);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(row);
    observer.observe(right);
    observer.observe(probe);
    window.addEventListener('resize', schedule);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return { compact, rowRef, rightRef, probeRef };
}

/** Invisible clone of logo + long tagline, used only to measure intrinsic width. */
export function HeaderTaglineWidthProbe({
  probeRef,
}: {
  probeRef: RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={probeRef}
      className="absolute left-0 top-0 invisible pointer-events-none flex items-center gap-2 w-max"
      aria-hidden
    >
      <span className="w-8 h-8 shrink-0" />
      <span className="flex items-baseline gap-1">
        <span className="shrink-0 text-lg font-extrabold uppercase tracking-[0.28em] leading-none">
          {BRAND_NAME}
        </span>
        <span className="whitespace-nowrap text-xs font-light tracking-wide leading-none">
          {BRAND_BASELINE}
        </span>
      </span>
    </div>
  );
}
/**
 * Variante mobile : au lieu de basculer vers une version compacte (le
 * slogan court est déjà celui affiché sur mobile via le CSS `sm:hidden`),
 * on masque entièrement le slogan quand il ne tient pas — plutôt que de le
 * tronquer avec des points de suspension — et on le réaffiche dès que la
 * place suffit à nouveau (ex. quand un badge Incognito / Hors découverte
 * apparaît ou disparaît à côté).
 */
export function useMobileTaglineFits(): {
  fits: boolean;
  rowRef: RefObject<HTMLDivElement>;
  rightRef: RefObject<HTMLDivElement>;
  probeRef: RefObject<HTMLDivElement>;
} {
  const rowRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const fitsRef = useRef(true);
  const [fits, setFits] = useState(true);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const right = rightRef.current;
    const probe = probeRef.current;
    if (!row || !right || !probe) return;

    const apply = () => {
      const styles = window.getComputedStyle(row);
      const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
      const availablePx = row.clientWidth - right.offsetWidth - gap;
      const neededPx = probe.offsetWidth;
      const next = taglineFits({
        availablePx,
        neededPx,
        currentlyFits: fitsRef.current,
      });
      if (next === fitsRef.current) return;
      fitsRef.current = next;
      setFits(next);
    };

    apply();

    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, HEADER_TAGLINE_MEASURE_DEBOUNCE_MS);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(row);
    observer.observe(right);
    observer.observe(probe);
    window.addEventListener('resize', schedule);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return { fits, rowRef, rightRef, probeRef };
}

/**
 * Clone invisible du logo + slogan court empilés (mise en page mobile), pour
 * mesurer la largeur réellement nécessaire pour afficher le slogan en entier.
 */
export function MobileTaglineWidthProbe({
  probeRef,
}: {
  probeRef: RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={probeRef}
      className="absolute left-0 top-0 invisible pointer-events-none flex items-center gap-2 w-max"
      aria-hidden
    >
      <span className="w-8 h-8 shrink-0" />
      <span className="flex flex-col gap-0.5">
        <span className="text-base font-extrabold uppercase tracking-[0.28em] leading-none">
          {BRAND_NAME}
        </span>
        <span className="text-[10.5px] font-light tracking-normal leading-none whitespace-nowrap">
          {BRAND_SHORT_TAGLINE_TEXT}
        </span>
      </span>
    </div>
  );
}
