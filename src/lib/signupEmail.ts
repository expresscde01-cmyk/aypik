import { supabase } from '@/lib/supabase';

/** RPC : vrai si un compte existe déjà pour cet e-mail (casse ignorée). */
export async function emailIsRegistered(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('email_is_registered', {
    p_email: email.trim(),
  });
  if (error) return false;
  return data === true;
}
