import { supabase } from '@/lib/supabase';

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
    return 'Formats acceptés : JPEG, PNG, WebP ou GIF.';
  }
  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    return 'La photo ne doit pas dépasser 5 Mo.';
  }
  return null;
}

/** Upload la photo dans Storage et renvoie l’URL publique. */
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

  const { data } = supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .getPublicUrl(path);

  if (!data?.publicUrl) {
    return { url: null, error: "Impossible d'obtenir l'URL de la photo." };
  }

  return { url: data.publicUrl, error: null };
}

/**
 * Variante 400w via le transform Storage (render/image).
 * Si le transform n’est pas dispo, ProfilePhoto retombe sur l’URL d’origine.
 */
export function profilePhotoSrc(url: string, width = 400): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const objectMarker = '/storage/v1/object/public/';
    if (!parsed.pathname.includes(objectMarker)) return trimmed;
    parsed.pathname = parsed.pathname.replace(
      objectMarker,
      '/storage/v1/render/image/public/'
    );
    parsed.searchParams.set('width', String(width));
    parsed.searchParams.set('resize', 'cover');
    parsed.searchParams.set('quality', '70');
    return parsed.toString();
  } catch {
    return trimmed;
  }
}
