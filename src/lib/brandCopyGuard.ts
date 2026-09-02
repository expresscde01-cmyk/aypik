/** Classe sur le nom AYPIK et le slogan long du bandeau (BrandLockup nav). */
export const BRAND_LOCKUP_NO_COPY_CLASS = 'brand-lockup-no-copy';

function isBrandLockupNoCopyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const el =
    target instanceof Element ? target : target.parentElement;
  return Boolean(el?.closest(`.${BRAND_LOCKUP_NO_COPY_CLASS}`));
}

/** Bloque copie / coupe / clic droit uniquement sur les nœuds marqués. */
export function mountBrandLockupCopyGuard(): () => void {
  const blockClipboard = (event: ClipboardEvent) => {
    if (isBrandLockupNoCopyTarget(event.target)) event.preventDefault();
  };

  const blockContextMenu = (event: MouseEvent) => {
    if (isBrandLockupNoCopyTarget(event.target)) event.preventDefault();
  };

  document.addEventListener('copy', blockClipboard);
  document.addEventListener('cut', blockClipboard);
  document.addEventListener('contextmenu', blockContextMenu);

  return () => {
    document.removeEventListener('copy', blockClipboard);
    document.removeEventListener('cut', blockClipboard);
    document.removeEventListener('contextmenu', blockContextMenu);
  };
}
