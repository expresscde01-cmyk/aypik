import { supabase } from '@/lib/supabase';

export async function deleteAccount(): Promise<string | null> {
  const { error } = await supabase.rpc('delete_account');

  if (!error) return null;

  if (error.code === '42883' || error.message.includes('delete_account')) {
    return "La suppression de compte n'est pas encore disponible. Exécutez la migration Supabase « delete_account ».";
  }

  if (error.message.includes('not_authenticated')) {
    return 'Vous devez être connecté(e) pour supprimer votre compte.';
  }

  return error.message;
}
