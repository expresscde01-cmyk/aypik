import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { BRAND_BASELINE, BRAND_NAME } from '@/components/BrandLockup';
import {
  HEADER_TAGLINE_MEASURE_DEBOUNCE_MS,
  HEADER_TAGLINE_SM_MAX_PX,
  taglineNeedsCompact,
} from '@/lib/headerTagline';

export function useHeaderTaglineCompact(): {
  compact: boolean;
  rowRef: RefObject<HTMLDivElement | null>;
  rightRef: RefObject<HTMLDivElement | null>;
  probeRef: RefObject<HTMLDivElement | null>;
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
  probeRef: RefObject<HTMLDivElement | null>;
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
