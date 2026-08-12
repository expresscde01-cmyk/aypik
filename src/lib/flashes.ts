import { supabase } from '@/lib/supabase';

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

export function flashErrorMessage(error?: string | null): string {
  switch (error) {
    case 'flash_quota_exhausted':
      return 'Limite de coups de cœur atteinte pour aujourd’hui. Passez à Premium pour en envoyer davantage.';
    case 'invalid_target':
      return 'Profil invalide.';
    case 'profile_not_found':
      return 'Ce profil n’est plus disponible.';
    case 'not_authenticated':
      return 'Session expirée. Reconnectez-vous.';
    default:
      return error || 'Impossible d’envoyer le coup de cœur.';
  }
}
