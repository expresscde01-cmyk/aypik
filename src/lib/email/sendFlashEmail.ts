import { supabase } from '@/lib/supabase';

export type SendFlashEmailInput = {
  notificationId: string;
  flashId: string;
  toUserId: string;
  fromDisplayName?: string;
};

export type SendFlashEmailResult = {
  ok: boolean;
  alreadySent?: boolean;
  skipped?: boolean;
  skippedReason?: string | null;
  error?: string | null;
  id?: string | null;
};

/**
 * Envoie l'e-mail transactionnel « flash reçu » via Edge Function Resend.
 * Non bloquant : les échecs réseau ne doivent pas casser l'UX flash.
 */
export async function sendFlashReceivedEmail(
  input: SendFlashEmailInput
): Promise<SendFlashEmailResult> {
  try {
    const { data, error } = await supabase.functions.invoke('send-flash-email', {
      body: {
        notificationId: input.notificationId,
        flashId: input.flashId,
        toUserId: input.toUserId,
        fromDisplayName: input.fromDisplayName?.trim() || undefined,
      },
    });

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
