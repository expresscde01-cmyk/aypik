import { MIN_INTERESTS } from './interests.ts';

/**
 * Champs réels du profil connecté. Chaque case vaut 1 si elle est remplie.
 * Les centres d’intérêt comptent à partir du minimum du site (3).
 * Pas de pourcentage stocké : le résultat se calcule à l’affichage.
 */
export type ProfileCompletionInput = {
  display_name?: string | null;
  photo_url?: string | null;
  bio?: string | null;
  location?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  interests?: readonly string[] | null;
  temperament?: readonly string[] | null;
  languages?: readonly unknown[] | null;
};

const CHECKS: Array<(profile: ProfileCompletionInput) => boolean> = [
  (profile) => Boolean(profile.display_name?.trim()),
  (profile) => Boolean(profile.photo_url?.trim()),
  (profile) => Boolean(profile.bio?.trim()),
  (profile) => Boolean(profile.location?.trim()),
  (profile) => Boolean(profile.gender?.trim()),
  (profile) => Boolean(profile.birth_date?.trim()),
  (profile) => (profile.interests?.length ?? 0) >= MIN_INTERESTS,
  (profile) => (profile.temperament?.length ?? 0) > 0,
  (profile) => (profile.languages?.length ?? 0) > 0,
];

export function profileCompletionPercent(
  profile: ProfileCompletionInput | null | undefined
): number | null {
  if (!profile) return null;
  const filled = CHECKS.filter((check) => check(profile)).length;
  return Math.round((filled / CHECKS.length) * 100);
}
