/** Ancrage d’origine des infobulles Flash/Like (bas-droite du bouton). */
export const ACTION_TOOLTIP_OVERLAP_X = 4;
export const ACTION_TOOLTIP_OVERLAP_Y = 6;
export const ACTION_TOOLTIP_VIEW_MARGIN = 8;

export type TooltipAnchorRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type TooltipSize = {
  width: number;
  height: number;
};

export type TooltipViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Place l’infobulle en bas-droite du bouton, puis la ramène dans le viewport. */
export function placePortaledActionTooltip(
  anchor: TooltipAnchorRect,
  tip: TooltipSize,
  viewport: TooltipViewport,
  margin = ACTION_TOOLTIP_VIEW_MARGIN
): { top: number; left: number } {
  let top = anchor.bottom - ACTION_TOOLTIP_OVERLAP_Y;
  let left = anchor.right - ACTION_TOOLTIP_OVERLAP_X;

  const maxLeft = viewport.left + viewport.width - margin - tip.width;
  const minLeft = viewport.left + margin;
  if (left > maxLeft) left = maxLeft;
  if (left < minLeft) left = minLeft;

  const maxTop = viewport.top + viewport.height - margin - tip.height;
  if (top > maxTop) {
    top = anchor.top - tip.height - ACTION_TOOLTIP_OVERLAP_Y;
  }
  const minTop = viewport.top + margin;
  if (top < minTop) top = minTop;

  return { top, left };
}

export const NOTIF_PANEL_MAX_WIDTH_PX = 320;
export const NOTIF_PANEL_GAP_BELOW_BELL = 8;

/**
 * Panneau cloche : aligné sur le bord droit de la cloche, puis ramené
 * dans le viewport (Accueil : la cloche n’est pas le dernier bouton).
 */
export function placeNotifPanel(
  anchor: Pick<TooltipAnchorRect, 'right' | 'bottom'>,
  viewport: TooltipViewport,
  preferredWidth = NOTIF_PANEL_MAX_WIDTH_PX,
  margin = ACTION_TOOLTIP_VIEW_MARGIN
): { top: number; left: number; width: number } {
  const width = Math.min(
    preferredWidth,
    Math.max(0, viewport.width - margin * 2)
  );
  let left = anchor.right - width;
  const minLeft = viewport.left + margin;
  const maxLeft = viewport.left + viewport.width - margin - width;
  if (left < minLeft) left = minLeft;
  if (left > maxLeft) left = maxLeft;

  let top = anchor.bottom + NOTIF_PANEL_GAP_BELOW_BELL;
  const minTop = viewport.top + margin;
  if (top < minTop) top = minTop;

  return { top, left, width };
}

export function notifPanelViewport(): TooltipViewport {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (vv) {
    return {
      left: vv.offsetLeft,
      top: vv.offsetTop,
      width: vv.width,
      height: vv.height,
    };
  }
  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}
