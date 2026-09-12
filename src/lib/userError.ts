/** Extrait un message lisible (Error, PostgREST `{ message }`, string). */
import { adultsOnlyMessage } from '@/lib/dating';
import { chatNotMatchedMessage } from '@/lib/matchManageError';
import { t } from '../i18n/t.ts';

export function userErrorMessage(
  err: unknown,
  fallback?: string
): string {
  const resolvedFallback = fallback ?? t('common.errorOccurred');
  if (typeof err === 'string' && err.trim()) {
    return friendlyDbMessage(err.trim(), resolvedFallback);
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) {
      return friendlyDbMessage(msg.trim(), resolvedFallback);
    }
  }
  return resolvedFallback;
}

export function memberUnavailableMessage(): string {
  return t('common.memberUnavailable');
}

function friendlyDbMessage(msg: string, fallback: string): string {
  if (msg.includes('member_unavailable')) return t('common.memberUnavailable');
  if (msg.includes('active_match_required')) return fallback;
  if (/\bnot_matched\b/.test(msg)) {
    return chatNotMatchedMessage();
  }
  if (msg.includes('minors_not_allowed')) return adultsOnlyMessage();
  if (msg.includes('decision_locked_refuse')) {
    return t('errors.alreadyRefused');
  }
  if (msg.includes('decision_locked_match')) {
    return t('errors.alreadyMatched');
  }
  if (msg.includes('decision_locked_wait')) {
    return t('errors.alreadyWaiting');
  }
  if (msg.includes('no_incoming_interest')) {
    return t('errors.noIncomingInterest');
  }
  if (msg.includes('not_paid_premium')) {
    return t('errors.testimonialPremiumOnly');
  }
  if (msg.includes('consent_required')) {
    return t('errors.testimonialConsent');
  }
  if (msg.includes('testimonial_too_short')) {
    return t('errors.testimonialTooShort');
  }
  if (msg.includes('testimonial_too_long')) {
    return t('errors.testimonialTooLong');
  }
  if (msg.includes('suggest_profiles')) {
    return 'Catalogue indisponible : la fonction suggest_profiles en base n’est pas à jour. Ne coller aucun ancien COLLER-*.sql (ils écraseraient le masquage des refus). Source : supabase/migrations/20260910173743_suggest_profiles_require_gender.sql';
  }
  if (msg.includes('not_initiator')) {
    return t('errors.onlyBreakerCanRestore');
  }
  if (
    msg.includes('manage_active_match') ||
    msg.includes('restore_broken_match') ||
    msg.includes('purge_broken_match') ||
    msg.includes('match_breaks')
  ) {
    return 'Action indisponible : colle COLLER-MATCH-BREAKS.sql dans l’éditeur SQL Supabase, puis Run.';
  }
  if (msg.includes('get_pending_by_others')) {
    return 'Action indisponible : colle COLLER-PENDING-BY-OTHERS.sql dans l’éditeur SQL Supabase, puis Run.';
  }
  if (msg.includes('dismiss_declined_notification')) {
    return 'Action indisponible : colle COLLER-DECLINED-ARCHIVES.sql dans l’éditeur SQL Supabase, puis Run.';
  }
  if (msg.includes('reset_inbox_interest') || msg.includes('restore_inbox_wait')) {
    return t('errors.cannotRestoreProfile');
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
