import { supabase } from '@/lib/supabase';

export type AuthCredentialsResult = {
  error: Error | null;
};

/**
 * API d’auth découplée de l’UI et de l’envoi d’e-mails produit.
 *
 * - Source de vérité : Supabase Auth (email / mot de passe).
 * - E-mails Auth (confirm / reset) : Supabase / SMTP amont.
 * - E-mails produit (welcome Resend) : après validation profil, via src/lib/email.
 * - Aucun await mail ici — l’auth n’est jamais bridée.
 */
export async function signUpWithEmailPassword(
  email: string,
  password: string,
  _options?: { founderOpen?: boolean }
): Promise<AuthCredentialsResult> {
  void _options;
  const trimmed = email.trim();
  const { error } = await supabase.auth.signUp({
    email: trimmed,
    password,
  });

  if (error) return { error };
  return { error: null };
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<AuthCredentialsResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  return { error: error ?? null };
}
