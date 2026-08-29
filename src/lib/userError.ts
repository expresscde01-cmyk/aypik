/** Extrait un message lisible (Error, PostgREST `{ message }`, string). */
import { ADULTS_ONLY_MESSAGE } from '@/lib/dating';

export function userErrorMessage(
  err: unknown,
  fallback = 'Une erreur est survenue'
): string {
  if (typeof err === 'string' && err.trim()) {
    return friendlyDbMessage(err.trim(), fallback);
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) {
      return friendlyDbMessage(msg.trim(), fallback);
    }
  }
  return fallback;
}

export const MEMBER_UNAVAILABLE_MESSAGE =
  'Ce membre n’est pas disponible actuellement.';

function friendlyDbMessage(msg: string, fallback: string): string {
  if (msg.includes('member_unavailable')) return MEMBER_UNAVAILABLE_MESSAGE;
  if (msg.includes('minors_not_allowed')) return ADULTS_ONLY_MESSAGE;
  if (msg.includes('decision_locked_refuse')) {
    return 'Tu as déjà refusé ce profil.';
  }
  if (msg.includes('decision_locked_match')) {
    return 'Ce match est déjà validé.';
  }
  if (msg.includes('decision_locked_wait')) {
    return 'Ce profil est déjà en attente.';
  }
  if (msg.includes('no_incoming_interest')) {
    return 'Plus d’intérêt en attente pour ce profil.';
  }
  if (msg.includes('not_paid_premium')) {
    return 'Les témoignages sont réservés aux membres Premium en cours d’abonnement.';
  }
  if (msg.includes('consent_required')) {
    return 'Coche la case de consentement pour autoriser la diffusion de ton témoignage.';
  }
  if (msg.includes('testimonial_too_short')) {
    return 'Ton témoignage est trop court (40 caractères minimum).';
  }
  if (msg.includes('testimonial_too_long')) {
    return 'Ton témoignage est trop long (800 caractères maximum).';
  }
  if (msg.includes('suggest_profiles')) {
    return 'Catalogue indisponible : colle COLLER-DISCOVERY-CATALOG.sql dans l’éditeur SQL Supabase, puis Run.';
  }
  if (
    msg.includes('manage_active_match') ||
    msg.includes('restore_broken_match') ||
    msg.includes('purge_broken_match') ||
    msg.includes('match_breaks')
  ) {
    return 'Action indisponible : colle COLLER-MATCH-BREAKS.sql dans l’éditeur SQL Supabase, puis Run.';
  }
  if (msg.includes('dismiss_declined_notification')) {
    return 'Action indisponible : colle COLLER-DECLINED-ARCHIVES.sql dans l’éditeur SQL Supabase, puis Run.';
  }
  if (msg.includes('reset_inbox_interest') || msg.includes('restore_inbox_wait')) {
    return 'Impossible de rétablir ce profil.';
  }
  if (
    /PGRST\d+|42\d{3}|42501|row-level security|permission denied|column .* does not exist|schema cache|could not find the function/i.test(
      msg
    )
  ) {
    return fallback;
  }
  return msg;
}
