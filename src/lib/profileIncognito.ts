import { supabase } from '@/lib/supabase';
import { userErrorMessage } from '@/lib/userError';

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
    return 'Le mode Incognito n’est pas encore disponible. Réessaie dans quelques instants.';
  }

  return userErrorMessage(
    error,
    'Impossible de mettre à jour le mode Incognito'
  );
}
