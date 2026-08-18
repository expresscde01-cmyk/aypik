import { supabase } from '@/lib/supabase';
import { lookupLocationCentre } from '@/lib/geoCommunes';

export async function ensureProfileCoordinates(profile: {
  id: string;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<{ lat: number; lng: number } | null> {
  const lat = Number(profile.lat);
  const lng = Number(profile.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  const location = String(profile.location || '').trim();
  if (!location) return null;
  const point = await lookupLocationCentre(location);
  if (!point) return null;
  await supabase
    .from('profiles')
    .update({ lat: point.lat, lng: point.lng })
    .eq('id', profile.id);
  return point;
}

export async function resolveCommuneCoordinates(options: {
  lat?: number;
  lng?: number;
  label: string;
}): Promise<{ lat: number; lng: number } | null> {
  const lat = Number(options.lat);
  const lng = Number(options.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return lookupLocationCentre(options.label);
}
