import { supabase } from '@/lib/supabase';
import { userErrorMessage } from '@/lib/userError';
import { t } from '../i18n/t.ts';

export async function setProfilePaused(
  userId: string,
  paused: boolean
): Promise<string | null> {
  const { error } = await supabase
    .from('profiles')
    .update({ paused_at: paused ? new Date().toISOString() : null })
    .eq('id', userId);

  if (!error) return null;

  if (/paused_at/i.test(error.message)) {
    return t('profile.pauseUnavailable');
  }

  return userErrorMessage(
    error,
    t('profile.pauseUpdateFail')
  );
}
