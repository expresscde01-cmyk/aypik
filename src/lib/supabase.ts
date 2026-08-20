import './disableNavigatorLocks';
import { createClient } from '@supabase/supabase-js';

/** Projet hébergé aypik.fr — URL et clé anon publiques (RLS), jamais la service_role. */
const PRODUCTION_SUPABASE_URL = 'https://dtsyeouinmpjvdgwkncu.supabase.co';
const PRODUCTION_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0c3llb3Vpbm1wanZkZ3drbmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDU0MzUsImV4cCI6MjEwMjAyMTQzNX0.y-l5P5jKZBQsuBnjfob4nMoIYTQLi1EnJ-EgeLo374s';

function readPublicSupabaseEnv(
  value: string | undefined,
  fallback: string,
): string {
  const trimmed = (value ?? '').trim();
  if (
    !trimmed ||
    trimmed.includes('YOUR_PROJECT') ||
    trimmed === 'your_anon_key'
  ) {
    return fallback;
  }
  return trimmed;
}

const supabaseUrl = readPublicSupabaseEnv(
  import.meta.env.VITE_SUPABASE_URL,
  PRODUCTION_SUPABASE_URL,
);
const supabaseAnonKey = readPublicSupabaseEnv(
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  PRODUCTION_SUPABASE_ANON_KEY,
);

/**
 * `lock: false` est ignoré par @supabase/auth-js 2.57 (`if (settings.lock)`
 * est falsy → navigator.locks). Un no-op truthy est l’équivalent réel.
 */
async function disableAuthNavigatorLock<R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  return await fn();
}

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
    lock: disableAuthNavigatorLock as any,
  },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});

(supabase.auth as any).lock = disableAuthNavigatorLock;
