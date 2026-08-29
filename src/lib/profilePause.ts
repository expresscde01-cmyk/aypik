import { supabase } from '@/lib/supabase';
import { userErrorMessage } from '@/lib/userError';

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
    return 'La mise en pause n’est pas encore disponible. Réessaie dans quelques instants.';
  }

  return userErrorMessage(
    error,
    'Impossible de mettre à jour la pause du profil'
  );
}
