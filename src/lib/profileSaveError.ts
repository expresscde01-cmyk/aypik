import { adultsOnlyMessage } from '@/lib/dating';
import { t } from '../i18n/t.ts';
import { userErrorMessage } from '@/lib/userError';

/**
 * Colonnes SELECT accordées à authenticated sur public.profiles.
 * Pas de birth_date, lat/lng, ni des flags de compte : RETURNING * répond 42501.
 */
export const PROFILE_PUBLIC_COLUMNS =
  'id, display_name, bio, has_children, location, interests, photo_url, gender, country_code, city_name, geoname_id, discover_mode, temperament, languages, created_at, updated_at';

/** Retour d’un insert / update / upsert : uniquement ces colonnes. */
export const PROFILE_WRITE_RETURN = PROFILE_PUBLIC_COLUMNS;

export type SupabaseErrorParts = {
  code: string;
  message: string;
  details: string;
  hint: string;
};

export function supabaseErrorParts(err: unknown): SupabaseErrorParts {
  const record =
    err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const message =
    typeof record.message === 'string'
      ? record.message
      : err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : '';
  return {
    code: typeof record.code === 'string' ? record.code : '',
    message,
    details: typeof record.details === 'string' ? record.details : '',
    hint: typeof record.hint === 'string' ? record.hint : '',
  };
}

export function profileSaveErrorKey(
  err: unknown
):
  | 'errors.phoneExists'
  | 'errors.profileFieldRequired'
  | 'errors.profileSaveDenied'
  | 'adults'
  | null {
  const parts = supabaseErrorParts(err);
  const blob = `${parts.code} ${parts.message} ${parts.details} ${parts.hint}`;
  if (parts.code === '23505' && /phone/i.test(blob)) return 'errors.phoneExists';
  if (parts.code === '23502' || /null value in column/i.test(blob)) {
    return 'errors.profileFieldRequired';
  }
  if (
    parts.code === '42501' ||
    /permission denied|row-level security/i.test(blob)
  ) {
    return 'errors.profileSaveDenied';
  }
  if (blob.includes('minors_not_allowed')) return 'adults';
  return null;
}

export function profileSaveDevDetail(err: unknown): string {
  const { code, message, details, hint } = supabaseErrorParts(err);
  return [code, message, details, hint].filter(Boolean).join(' — ');
}

export function presentProfileSaveError(err: unknown): string {
  const key = profileSaveErrorKey(err);
  const friendly =
    key === 'adults'
      ? adultsOnlyMessage()
      : key
        ? t(key)
        : userErrorMessage(err);
  const raw = profileSaveDevDetail(err);
  console.error('Enregistrement du profil', raw || err);
  if (import.meta.env?.DEV && raw && !friendly.includes(raw)) {
    return `${friendly}\n${raw}`;
  }
  return friendly;
}
