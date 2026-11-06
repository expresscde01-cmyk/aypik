/** Garde posée par la page Mon profil tant qu’elle est affichée. */
let ask: (() => boolean) | null = null;

export function registerUnsavedProfileGuard(next: (() => boolean) | null) {
  ask = next;
}

/** true : la navigation peut continuer. */
export function confirmLeaveUnsavedProfile(): boolean {
  if (!ask) return true;
  return ask();
}
