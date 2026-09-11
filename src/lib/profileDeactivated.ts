import { supabase } from '@/lib/supabase';
import { userErrorMessage } from '@/lib/userError';
import { t } from '../i18n/t.ts';

export async function setProfileDeactivated(
  userId: string,
  deactivated: boolean
): Promise<string | null> {
  const { error } = await supabase
    .from('profiles')
    .update({
      deactivated_at: deactivated ? new Date().toISOString() : null,
    })
    .eq('id', userId);

  if (!error) return null;

  if (/deactivated_at/i.test(error.message)) {
    return t('profile.deactivatedUnavailable');
  }

  return userErrorMessage(
    error,
    t('profile.deactivatedUpdateFail')
  );
}
