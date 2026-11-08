import { supabase } from '@/lib/supabase';
import { t } from '../i18n/t.ts';

export const PROFILE_PHOTOS_BUCKET = 'profile-photos';
export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024; // 5 Mo

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

function extensionFor(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName) && fromName.length <= 5) {
    return fromName === 'jpg' ? 'jpeg' : fromName;
  }
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  if (file.type === 'image/heic' || file.type === 'image/heif') return 'heic';
  return 'jpeg';
}

export function validateProfilePhoto(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type) && !file.type.startsWith('image/')) {
    return t('profile.photoFormatError');
  }
  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    return t('profile.photoSizeError');
  }
  return null;
}

/** Upload la photo dans Storage et renvoie le chemin <id>/<fichier>. */
export async function uploadProfilePhoto(
  userId: string,
  file: File
): Promise<{ url: string | null; error: string | null }> {
  const validationError = validateProfilePhoto(file);
  if (validationError) return { url: null, error: validationError };

  const ext = extensionFor(file);
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || `image/${ext}`,
    });

  if (uploadError) {
    if (
      uploadError.message.includes('Bucket not found') ||
      uploadError.message.includes('not found')
    ) {
      return {
        url: null,
        error:
          "Le stockage des photos n'est pas encore configuré. Exécutez la migration Supabase « profile_photos_storage ».",
      };
    }
    return { url: null, error: uploadError.message };
  }

  return { url: path, error: null };
}

const PHOTO_HOST = 'https://dtsyeouinmpjvdgwkncu.supabase.co';
const PHOTO_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGN_CACHE_MS = 50 * 60 * 1000;
const SIGN_BATCH = 100;

type CacheEntry = { url: string | null; until: number };

const signedCache = new Map<string, CacheEntry>();
const waiters = new Map<string, Array<(url: string | null) => void>>();
let queued: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function unsafePath(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    value.includes('..') ||
    value.includes('\\') ||
    lower.includes('%2e') ||
    lower.includes('%2f') ||
    lower.includes('%5c')
  );
}

function asObjectPath(folder: string, file: string): string | null {
  if (!PHOTO_ID.test(folder) || !file || file.includes('/')) return null;
  return `${folder.toLowerCase()}/${file}`;
}

/** Chemin <id>/<fichier>, ou null si la valeur n'est pas une photo du projet. */
export function profilePhotoObjectPath(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw || unsafePath(raw)) return null;
  const bare = raw.split(/[?#]/, 1)[0];
  if (!bare.includes('://')) {
    const slash = bare.indexOf('/');
    if (slash <= 0) return null;
    return asObjectPath(bare.slice(0, slash), bare.slice(slash + 1));
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.origin !== PHOTO_HOST) return null;
  const marker = '/profile-photos/';
  const at = parsed.pathname.indexOf(marker);
  if (at < 0) return null;
  const rest = decodeURIComponent(parsed.pathname.slice(at + marker.length));
  if (unsafePath(rest)) return null;
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  return asObjectPath(rest.slice(0, slash), rest.slice(slash + 1));
}

function remember(path: string, url: string | null, ttl: number) {
  signedCache.set(path, { url, until: Date.now() + ttl });
  const pending = waiters.get(path) ?? [];
  waiters.delete(path);
  for (const resolve of pending) resolve(url);
}

async function flushSignQueue() {
  flushTimer = null;
  const batch = queued.splice(0, SIGN_BATCH);
  if (queued.length > 0 && flushTimer == null) {
    flushTimer = setTimeout(() => void flushSignQueue(), 0);
  }
  if (batch.length === 0) return;

  let urls: Record<string, string> = {};
  try {
    const { data, error } = await supabase.functions.invoke('sign-profile-photos', {
      body: { paths: batch },
    });
    if (!error && data && typeof data === 'object' && data.urls && typeof data.urls === 'object') {
      urls = data.urls as Record<string, string>;
    }
  } catch {
    urls = {};
  }

  for (const path of batch) {
    const signed = typeof urls[path] === 'string' ? urls[path] : null;
    remember(path, signed, signed ? SIGN_CACHE_MS : 30_000);
  }
}

/** URL signée 400 px, gardée 50 minutes. Null si la signature échoue. */
export function requestSignedProfilePhoto(stored: string): Promise<string | null> {
  const path = profilePhotoObjectPath(stored);
  if (!path) return Promise.resolve(null);
  const hit = signedCache.get(path);
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.url);
  return new Promise((resolve) => {
    const list = waiters.get(path) ?? [];
    list.push(resolve);
    waiters.set(path, list);
    if (!queued.includes(path)) queued.push(path);
    if (flushTimer == null) flushTimer = setTimeout(() => void flushSignQueue(), 0);
  });
}
