import { supabase } from '@/lib/supabase';
import {
  SITE_FREE_MODE,
  isFounderPrivilegeActive,
  type OfferStatusLike,
} from '@/lib/founderCopy';

export type SendFlashResult = {
  ok: boolean;
  already_flashed?: boolean;
  flash_id?: string;
  notification_id?: string;
  to_user?: string;
  from_display_name?: string;
  should_notify_email?: boolean;
  flashes_remaining_today?: number | null;
  free_daily_flashes?: number;
  error?: string | null;
};

export async function sendFlash(toUserId: string): Promise<SendFlashResult> {
  const { data, error } = await supabase.rpc('send_flash', {
    p_to_user: toUserId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Réponse invalide' };
  }

  const payload = data as Record<string, unknown>;
  return {
    ok: payload.ok === true,
    already_flashed: payload.already_flashed === true,
    flash_id: typeof payload.flash_id === 'string' ? payload.flash_id : undefined,
    notification_id:
      typeof payload.notification_id === 'string'
        ? payload.notification_id
        : undefined,
    to_user: typeof payload.to_user === 'string' ? payload.to_user : undefined,
    from_display_name:
      typeof payload.from_display_name === 'string'
        ? payload.from_display_name
        : undefined,
    should_notify_email: payload.should_notify_email === true,
    flashes_remaining_today:
      typeof payload.flashes_remaining_today === 'number'
        ? payload.flashes_remaining_today
        : payload.flashes_remaining_today === null
          ? null
          : undefined,
    free_daily_flashes:
      typeof payload.free_daily_flashes === 'number'
        ? payload.free_daily_flashes
        : undefined,
    error: typeof payload.error === 'string' ? payload.error : null,
  };
}

/**
 * Coup de cœur (éclair) : inclus pendant la fenêtre Fondateur (6 mois),
 * y compris en mode site gratuit. Masqué hors fenêtre au lancement.
 */
export function isFlashCtaVisible(status?: OfferStatusLike): boolean {
  if (status && isFounderPrivilegeActive(status)) return true;
  if (SITE_FREE_MODE) return false;
  return true;
}

export function flashErrorMessage(
  error?: string | null,
  status?: OfferStatusLike
): string {
  switch (error) {
    case 'flash_reserved_for_founders':
    case 'flash_not_available_for_founders':
      return 'Le coup de cœur est réservé aux Membres Fondateurs pendant le lancement.';
    case 'flash_quota_exhausted':
      if (status && status.plan === 'premium') {
        return 'Limite de coups de cœur atteinte pour aujourd’hui.';
      }
      if (SITE_FREE_MODE) {
        return 'Limite de coups de cœur atteinte pour aujourd’hui. Réessaie demain.';
      }
      return 'Limite de coups de cœur atteinte pour aujourd’hui. Passe à Premium pour en envoyer davantage.';
    case 'invalid_target':
    case 'age_rule_violation':
      return 'Profil invalide.';
    case 'profile_not_found':
      return 'Ce profil n’est plus disponible.';
    case 'not_authenticated':
      return 'Session expirée. Reconnecte-toi.';
    default:
      return error || 'Impossible d’envoyer le coup de cœur.';
  }
}
