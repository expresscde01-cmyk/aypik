import { supabase } from '@/lib/supabase';
import { parseDiscoverMode } from '@/lib/discoverMode';
import { parseProfileGender, type ProfileGender } from '@/lib/dating';
import {
  parseSpokenLanguages,
  type SpokenLanguage,
} from '@/lib/spokenLanguages';

/** Ligne renvoyée par RPC my_profile() — uniquement le compte connecté. */
export type MyProfile = {
  id: string;
  display_name: string;
  birth_date: string;
  bio: string;
  has_children: boolean;
  location: string;
  interests: string[];
  photo_url: string;
  gender: ProfileGender | null;
  lat: number | null;
  lng: number | null;
  deletion_requested_at: string | null;
  country_code: string | null;
  city_name: string | null;
  geoname_id: number | null;
  discover_mode: 'detaille' | 'simplifie';
  email_notifications_enabled: boolean;
  preferred_locale: string | null;
  temperament: string[] | null;
  languages: SpokenLanguage[] | null;
  paused_at: string | null;
  deactivated_at: string | null;
  incognito_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  age: number;
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

export function parseMyProfile(raw: unknown): MyProfile | null {
  const row = Array.isArray(raw) ? asRecord(raw[0]) : asRecord(raw);
  const id = typeof row.id === 'string' ? row.id : '';
  if (!id) return null;
  const age = Number(row.age);
  return {
    id,
    display_name: String(row.display_name || ''),
    birth_date: typeof row.birth_date === 'string' ? row.birth_date : '',
    bio: String(row.bio || ''),
    has_children: Boolean(row.has_children),
    location: String(row.location || ''),
    interests: Array.isArray(row.interests)
      ? row.interests.filter((item): item is string => typeof item === 'string')
      : [],
    photo_url: String(row.photo_url || ''),
    gender: parseProfileGender(
      typeof row.gender === 'string' ? row.gender : null
    ),
    lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
    lng: Number.isFinite(Number(row.lng)) ? Number(row.lng) : null,
    deletion_requested_at:
      typeof row.deletion_requested_at === 'string'
        ? row.deletion_requested_at
        : null,
    country_code:
      typeof row.country_code === 'string' ? row.country_code : null,
    city_name: typeof row.city_name === 'string' ? row.city_name : null,
    geoname_id: Number.isFinite(Number(row.geoname_id))
      ? Number(row.geoname_id)
      : null,
    discover_mode: parseDiscoverMode(
      typeof row.discover_mode === 'string' ? row.discover_mode : null
    ),
    email_notifications_enabled: row.email_notifications_enabled !== false,
    preferred_locale:
      typeof row.preferred_locale === 'string' ? row.preferred_locale : null,
    temperament: Array.isArray(row.temperament)
      ? row.temperament.filter((item): item is string => typeof item === 'string')
      : null,
    languages:
      row.languages == null ? null : parseSpokenLanguages(row.languages),
    paused_at: typeof row.paused_at === 'string' ? row.paused_at : null,
    deactivated_at:
      typeof row.deactivated_at === 'string' ? row.deactivated_at : null,
    incognito_at:
      typeof row.incognito_at === 'string' ? row.incognito_at : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
    age: Number.isFinite(age) ? age : 0,
  };
}

export async function fetchMyProfile(): Promise<{
  data: MyProfile | null;
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc('my_profile');
  if (error) return { data: null, error };
  return { data: parseMyProfile(data), error: null };
}
