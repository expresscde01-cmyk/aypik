import { queryClient } from '@/lib/queryClient';
import {
  IDLE_AUTH_NOTICE_KEY,
  IDLE_FORCE_LOGOUT_KEY,
  IDLE_WATCH_KEY,
  REMEMBER_SESSION_KEY,
} from '@/lib/sessionIdle';

const AYPIK_PREFIX = 'aypik:';
const PREFS_PREFIX = 'aypik:suggestion-prefs:';

const PRESERVED_AYPIK_KEYS = new Set([
  IDLE_WATCH_KEY,
  IDLE_FORCE_LOGOUT_KEY,
  IDLE_AUTH_NOTICE_KEY,
  REMEMBER_SESSION_KEY,
]);

function isAuthSessionKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.startsWith('sb-') ||
    lower.includes('auth-token') ||
    lower.includes('supabase.auth')
  );
}

function shouldPreserveAypikKey(key: string): boolean {
  if (key.startsWith(PREFS_PREFIX)) return true;
  if (isAuthSessionKey(key)) return true;
  if (PRESERVED_AYPIK_KEYS.has(key)) return true;
  if (key.startsWith('aypik:idle-')) return true;
  return false;
}

/**
 * Cache applicatif local (équivalent F5 renforcé).
 * Ne touche pas à la session Auth, à l’idle-watch, ni aux filtres aypik:suggestion-prefs:*.
 */
export function clearAypikAppCache(): void {
  if (typeof localStorage === 'undefined') return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (!key.startsWith(AYPIK_PREFIX)) continue;
    if (shouldPreserveAypikKey(key)) continue;
    toRemove.push(key);
  }
  for (const key of toRemove) {
    localStorage.removeItem(key);
  }
  queryClient.clear();
}
