import { supabase } from '@/lib/supabase';
import { notifySignupEmailHook } from '@/lib/email';

export type AuthCredentialsResult = {
  error: Error | null;
};

/**
 * API d’auth découplée de l’UI et de l’envoi d’e-mails.
 *
 * - Source de vérité : Supabase Auth (email / mot de passe).
 * - Aucune confirmation e-mail forcée côté client.
 * - Aucun await sur un fournisseur mail externe.
 * - Les e-mails Auth (confirm / reset) restent configurables
 *   dans le dashboard Supabase ou via SMTP / Auth Hooks amont.
 */
export async function signUpWithEmailPassword(
  email: string,
  password: string,
  options?: { founderOpen?: boolean }
): Promise<AuthCredentialsResult> {
  const trimmed = email.trim();
  const { error } = await supabase.auth.signUp({
    email: trimmed,
    password,
  });

  if (error) return { error };

  // Fire-and-forget uniquement : ne bloque pas l’inscription.
  notifySignupEmailHook({
    email: trimmed,
    founderOpen: options?.founderOpen,
  });

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
