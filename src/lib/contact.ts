import { supabase } from '@/lib/supabase';

export const CONTACT_CATEGORIES = [
  { value: 'general', label: 'Question générale' },
  { value: 'technical', label: 'Problème technique' },
  { value: 'report', label: 'Signalement' },
  { value: 'other', label: 'Autre' },
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number]['value'];

export const CONTACT_SUCCESS_MESSAGE =
  'Votre message a bien été envoyé, nous vous répondrons sous 48 heures.';

export const CONTACT_CAPTCHA_ERROR =
  'Le CAPTCHA est invalide ou a expiré. Merci de le valider à nouveau.';

export const CONTACT_SEND_ERROR =
  "L'envoi a échoué. Merci de réessayer dans quelques instants.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactFormValues = {
  name: string;
  email: string;
  category: string;
  message: string;
  consent: boolean;
};

export function validateContactForm(
  values: ContactFormValues
): string | null {
  const name = values.name.trim();
  const email = values.email.trim();
  const message = values.message.trim();
  if (!name) return 'Indiquez votre nom.';
  if (!email) return 'Indiquez votre adresse e-mail.';
  if (!EMAIL_RE.test(email)) return 'Adresse e-mail invalide.';
  if (!isContactCategory(values.category)) {
    return 'Choisissez un sujet.';
  }
  if (!message) return 'Écrivez votre message.';
  if (message.length > 4000) {
    return 'Le message est trop long (4 000 caractères maximum).';
  }
  if (!values.consent) {
    return 'Merci d’accepter l’utilisation de vos données pour traiter la demande.';
  }
  return null;
}

export async function submitContactForm(
  values: ContactFormValues,
  captchaToken: string | null
): Promise<{ ok: true } | { ok: false; code: string; error: string }> {
  const validationError = validateContactForm(values);
  if (validationError) {
    return { ok: false, code: 'validation_failed', error: validationError };
  }
  if (!captchaToken) {
    return { ok: false, code: 'captcha_failed', error: CONTACT_CAPTCHA_ERROR };
  }

  const { data, error } = await supabase.functions.invoke('contact', {
    body: {
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      category: values.category,
      message: values.message.trim(),
      consent: true,
      captchaToken,
    },
  });

  const payload =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};

  const resendId =
    typeof payload.id === 'string' ? payload.id.trim() : '';
  if (payload.ok === true && resendId) return { ok: true };

  const code =
    typeof payload.code === 'string' && payload.code
      ? payload.code
      : await functionErrorCode(error, payload);

  return {
    ok: false,
    code,
    error: messageForContactCode(code),
  };
}

function isContactCategory(value: string): value is ContactCategory {
  return CONTACT_CATEGORIES.some((item) => item.value === value);
}

function messageForContactCode(code: string): string {
  if (code === 'captcha_failed') return CONTACT_CAPTCHA_ERROR;
  if (code === 'validation_failed') {
    return 'Vérifiez les champs du formulaire, puis réessayez.';
  }
  return CONTACT_SEND_ERROR;
}

async function functionErrorCode(
  error: unknown,
  payload: Record<string, unknown>
): Promise<string> {
  if (typeof payload.code === 'string' && payload.code.trim()) {
    return payload.code;
  }
  const ctx =
    error && typeof error === 'object' && 'context' in error
      ? (error as { context?: Response }).context
      : undefined;
  if (ctx && typeof ctx.clone === 'function') {
    try {
      const body = (await ctx.clone().json()) as { code?: unknown };
      if (typeof body?.code === 'string' && body.code.trim()) {
        return body.code;
      }
    } catch {
      /* corps non JSON */
    }
  }
  return 'send_failed';
}
