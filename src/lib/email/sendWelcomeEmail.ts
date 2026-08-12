import { supabase } from '@/lib/supabase';
import type {
  SendWelcomeEmailInput,
  SendWelcomeEmailResult,
} from '@/lib/email/types';

/**
 * Déclenche l'envoi de l'e-mail de bienvenue Fondateur via Edge Function Resend.
 * Ne bloque pas l'inscription en cas d'échec réseau / configuration.
 */
export async function sendFounderWelcomeEmail(
  input: SendWelcomeEmailInput = {}
): Promise<SendWelcomeEmailResult> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'send-welcome-email',
      {
        body: {
          displayName: input.displayName?.trim() || undefined,
        },
      }
    );

    if (error) {
      return { ok: false, error: error.message };
    }

    const payload =
      data && typeof data === 'object'
        ? (data as Record<string, unknown>)
        : {};

    if (payload.error && !payload.ok) {
      return {
        ok: false,
        skipped: payload.skipped === true,
        skippedReason:
          typeof payload.skippedReason === 'string'
            ? payload.skippedReason
            : null,
        error: String(payload.error),
      };
    }

    return {
      ok: true,
      alreadySent: payload.alreadySent === true,
      skipped: payload.skipped === true,
      skippedReason:
        typeof payload.skippedReason === 'string'
          ? payload.skippedReason
          : null,
      id: typeof payload.id === 'string' ? payload.id : null,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Échec envoi e-mail',
    };
  }
}
