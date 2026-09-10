import { supabase } from '@/lib/supabase';

/**
 * Demande d’envoi du SMS OTP via l’Edge Function send-phone-verification
 * (JWT + Turnstile + allowlist pays + quotas). Ne pas appeler
 * supabase.auth.updateUser({ phone }) depuis le client : ça contournerait
 * ces contrôles.
 *
 * Limite connue : un utilisateur peut toujours appeler PUT /auth/v1/user
 * avec son JWT (endpoint GoTrue natif, non révocable). Les vrais verrous
 * restent les Geographic Permissions Twilio et le plafond projet 30 SMS/h.
 */

export async function requestPhoneVerificationSms(
  phone: string,
  captchaToken: string | null
): Promise<void> {
  if (!captchaToken) {
    throw Object.assign(new Error('CAPTCHA invalide ou expiré. Réessaie.'), {
      code: 'captcha_failed',
    });
  }

  const { data, error } = await supabase.functions.invoke(
    'send-phone-verification',
    { body: { phone, captchaToken } }
  );

  const payload = await parseFunctionPayload(error, data);
  if (payload.ok === true) return;

  const code =
    typeof payload.code === 'string' && payload.code.trim()
      ? payload.code.trim()
      : 'sms_send_failed';
  const message =
    typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : 'Impossible d’envoyer le SMS pour le moment. Réessaie dans un instant.';

  throw Object.assign(new Error(message), { code });
}

async function parseFunctionPayload(
  error: unknown,
  data: unknown
): Promise<Record<string, unknown>> {
  const fromData =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  if (Object.keys(fromData).length > 0) return fromData;

  const ctx =
    error && typeof error === 'object' && 'context' in error
      ? (error as { context?: Response }).context
      : undefined;
  if (ctx && typeof ctx.clone === 'function') {
    try {
      const body = (await ctx.clone().json()) as unknown;
      if (body && typeof body === 'object') {
        return body as Record<string, unknown>;
      }
    } catch {
      /* corps non JSON */
    }
  }
  return fromData;
}
