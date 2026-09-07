/**
 * Affiche la session tout de suite, puis vérifie le verrou en arrière-plan.
 * Le verrouillage reste appliqué (signOut) dès que le RPC répond ;
 * il ne retarde plus le premier rendu.
 */
export function revealThenVerifyLock(input: {
  reveal: () => void;
  isLocked: () => Promise<boolean>;
  onLocked: () => void | Promise<void>;
}): void {
  input.reveal();
  void input.isLocked()
    .then((locked) => {
      if (locked) return input.onLocked();
    })
    .catch(() => {});
}
