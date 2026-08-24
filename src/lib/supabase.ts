import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/**
 * Par défaut, supabase-js sérialise ses opérations d'auth (login, refresh...)
 * via l'API navigateur Navigator LockManager, pour éviter les conflits entre
 * onglets. Sur certains navigateurs/configs (ex. Firefox avec protections
 * anti-tracking renforcées, certaines extensions), l'acquisition du verrou
 * échoue immédiatement ("Acquiring an exclusive Navigator LockManager lock
 * ... immediately failed"), et l'appel reste bloqué indéfiniment sans erreur
 * visible : signInWithPassword() ne se termine jamais, le bouton ne fait
 * "rien". On désactive donc ce verrou (workaround documenté par Supabase,
 * cf. github.com/supabase/supabase-js/issues/1594) : impact minime pour ce
 * site (pas d'usage multi-onglets simultanés critique).
 */
const noOpLock = async <R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> => fn();

/**
 * Client navigateur : clé anon uniquement (RLS).
 * - PKCE plutôt que le flux implicit (tokens dans le hash URL).
 * - Session en localStorage, refresh auto, cache HTTP désactivé (pas de token en cache).
 * Ne pas changer storageKey : ça déconnecterait tous les comptes déjà ouverts.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    lock: noOpLock,
  },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});
