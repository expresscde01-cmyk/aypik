import { createClient, processLock } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/**
 * Client navigateur : clé anon uniquement (RLS).
 * - PKCE plutôt que le flux implicit (tokens dans le hash URL).
 * - Session en localStorage, refresh auto, cache HTTP désactivé (pas de token en cache).
 * - processLock : pas d’API Web Locks (Firefox lève « lock:sb-…-auth-token »).
 * Ne pas changer storageKey : ça déconnecterait tous les comptes déjà ouverts.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    lock: processLock,
  },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});
