import { queryClient } from '@/lib/queryClient';

const AYPIK_PREFIX = 'aypik:';
const PREFS_PREFIX = 'aypik:suggestion-prefs:';

function isAuthSessionKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.startsWith('sb-') ||
    lower.includes('auth-token') ||
    lower.includes('supabase.auth')
  );
}

/**
 * Cache applicatif local (équivalent F5 renforcé).
 * Ne touche pas à la session Auth ni aux filtres aypik:suggestion-prefs:*.
 */
export function clearAypikAppCache(): void {
  if (typeof localStorage === 'undefined') return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (!key.startsWith(AYPIK_PREFIX)) continue;
    if (key.startsWith(PREFS_PREFIX)) continue;
    if (isAuthSessionKey(key)) continue;
    toRemove.push(key);
  }
  for (const key of toRemove) {
    localStorage.removeItem(key);
  }
  queryClient.clear();
}
