import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { placePortaledActionTooltip } from '@/lib/portaledActionTooltip';

/**
 * Infobulle Flash/Like hors stacking context des cartes Découvrir.
 * ProfileDetailModal n’en a pas l’équivalent : ses tooltips restent en absolute
 * dans la fiche déjà portée au body.
 */
export default function PortaledActionTooltip({
  open,
  anchorRef,
  children,
  tooltipClassName,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** Classes additionnelles (ex. !bg-white !text-gray-600) pour dévier du style ambré par défaut. */
  tooltipClassName?: string;
}) {
  const tipRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }

    const place = () => {
      const anchor = anchorRef.current;
      const tip = tipRef.current;
      if (!anchor || !tip) return;
      const r = anchor.getBoundingClientRect();
      const vv = window.visualViewport;
      setPos(
        placePortaledActionTooltip(
          { top: r.top, right: r.right, bottom: r.bottom, left: r.left },
          { width: tip.offsetWidth, height: tip.offsetHeight },
          {
            left: vv?.offsetLeft ?? 0,
            top: vv?.offsetTop ?? 0,
            width: vv?.width ?? window.innerWidth,
            height: vv?.height ?? window.innerHeight,
          }
        )
      );
    };

    place();
    let raf = 0;
    const started = performance.now();
    const followScale = (now: number) => {
      place();
      if (now - started < 280) raf = requestAnimationFrame(followScale);
    };
    raf = requestAnimationFrame(followScale);

    const onWin = () => place();
    const vv = window.visualViewport;
    window.addEventListener('scroll', onWin, true);
    window.addEventListener('resize', onWin);
    vv?.addEventListener('resize', onWin);
    vv?.addEventListener('scroll', onWin);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onWin, true);
      window.removeEventListener('resize', onWin);
      vv?.removeEventListener('resize', onWin);
      vv?.removeEventListener('scroll', onWin);
    };
  }, [open, anchorRef, children]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <span
      ref={tipRef}
      role="tooltip"
      className={`profile-action-tooltip pointer-events-none fixed z-[60] max-w-[calc(100vw-16px)] whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide shadow-sm${tooltipClassName ? ` ${tooltipClassName}` : ''}`}
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </span>,
    document.body
  );
}
