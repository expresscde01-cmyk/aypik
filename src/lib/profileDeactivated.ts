import { supabase } from '@/lib/supabase';
import { userErrorMessage } from '@/lib/userError';

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
    return 'La mise en pause du compte n’est pas encore disponible. Réessaie dans quelques instants.';
  }

  return userErrorMessage(
    error,
    'Impossible de mettre à jour la pause du compte'
  );
}
