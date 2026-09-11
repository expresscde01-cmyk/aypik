import { supabase } from '@/lib/supabase';
import { userErrorMessage } from '@/lib/userError';
import { t } from '../i18n/t.ts';

export async function setProfileIncognito(
  userId: string,
  incognito: boolean
): Promise<string | null> {
  const { error } = await supabase
    .from('profiles')
    .update({ incognito_at: incognito ? new Date().toISOString() : null })
    .eq('id', userId);

  if (!error) return null;

  if (/incognito_at/i.test(error.message)) {
    return t('profile.incognitoUnavailable');
  }

  return userErrorMessage(
    error,
    t('profile.incognitoUpdateFail')
  );
}
