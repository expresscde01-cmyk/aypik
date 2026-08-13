import { supabase } from '@/lib/supabase';

function mapDeletionError(error: {
  code?: string;
  message: string;
}): string {
  if (
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    /request_account_deletion|cancel_account_deletion|delete_account/i.test(
      error.message
    )
  ) {
    return "La suppression de compte n'est pas encore disponible. Réessayez dans quelques secondes.";
  }

  if (error.message.includes('not_authenticated')) {
    return 'Vous devez être connecté(e) pour gérer la suppression de votre compte.';
  }

  if (error.message.includes('profile_not_found')) {
    return 'Profil introuvable. Enregistrez votre profil avant de demander la suppression.';
  }

  if (error.message.includes('deletion_already_processed')) {
    return 'Le délai de 30 jours est écoulé : le compte ne peut plus être restauré.';
  }

  return error.message;
}

export async function requestAccountDeletion(): Promise<string | null> {
  const { error } = await supabase.rpc('request_account_deletion');
  if (!error) return null;
  return mapDeletionError(error);
}

export async function cancelAccountDeletion(): Promise<string | null> {
  const { error } = await supabase.rpc('cancel_account_deletion');
  if (!error) return null;
  return mapDeletionError(error);
}

/** @deprecated Utiliser requestAccountDeletion (délai de 30 jours). */
export async function deleteAccount(): Promise<string | null> {
  return requestAccountDeletion();
}

export async function purgeExpiredDeletions(): Promise<void> {
  await supabase.rpc('purge_expired_deletions');
}
