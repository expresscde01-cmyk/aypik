import { supabase } from '@/lib/supabase';
import type { EmailMessage, EmailProvider, SendEmailResult } from './types';

/**
 * Relais optionnel vers une Edge Function `send-email` (Resend, SendGrid, etc.).
 * Si la fonction n’est pas déployée, l’échec est soft (skipped) — jamais bloquant.
 */
export function createEdgeEmailProvider(
  functionName = 'send-email'
): EmailProvider {
  return {
    name: `edge:${functionName}`,
    async send(message: EmailMessage): Promise<SendEmailResult> {
      try {
        const { data, error } = await supabase.functions.invoke(functionName, {
          body: message,
        });
        if (error) {
          return { ok: false, error: error.message, skipped: true };
        }
        if (data?.error) {
          return { ok: false, error: String(data.error), skipped: true };
        }
        return {
          ok: true,
          id: typeof data?.id === 'string' ? data.id : undefined,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'email_send_failed',
          skipped: true,
        };
      }
    },
  };
}
