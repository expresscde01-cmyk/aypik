/**
 * Firefox et certains navigateurs font échouer `navigator.locks.request`
 * avec `{ ifAvailable: true }` (onglet, tracking protection, LockManager
 * incomplet) → Supabase throw « lock immediately failed » et casse l’auth.
 *
 * Doit s’exécuter avant `createClient`.
 */
export function disableNavigatorLocks(): void {
  if (typeof navigator === 'undefined') return;
  const locks = navigator.locks;
  if (!locks || typeof locks.request !== 'function') return;

  const request = (
    name: string,
    optionsOrCallback?: LockOptions | LockGrantedCallback,
    maybeCallback?: LockGrantedCallback,
  ) => {
    const callback =
      typeof optionsOrCallback === 'function'
        ? optionsOrCallback
        : maybeCallback;
    const fakeLock = { name, mode: 'exclusive' as const };
    return Promise.resolve().then(() => callback?.(fakeLock));
  };

  try {
    locks.request = request as typeof locks.request;
  } catch {
    try {
      Object.defineProperty(locks, 'request', {
        configurable: true,
        writable: true,
        value: request,
      });
    } catch {
      /* LockManager non remplaçable */
    }
  }
}

disableNavigatorLocks();
