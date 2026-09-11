import { supabase } from '@/lib/supabase';
import { t } from '../i18n/t.ts';

const CONTACT_CATEGORY_IDS = [
  'general',
  'technical',
  'report',
  'other',
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORY_IDS)[number];

const CONTACT_CATEGORY_KEYS: Record<ContactCategory, string> = {
  general: 'contact.categoryGeneral',
  technical: 'contact.categoryTechnical',
  report: 'contact.categoryReport',
  other: 'contact.categoryOther',
};

export function contactCategories(): {
  value: ContactCategory;
  label: string;
}[] {
  return CONTACT_CATEGORY_IDS.map((value) => ({
    value,
    label: t(CONTACT_CATEGORY_KEYS[value]),
  }));
}

export function contactSuccessMessage(): string {
  return t('contact.success');
}

export function contactCaptchaError(): string {
  return t('contact.captchaError');
}

export function contactSendError(): string {
  return t('contact.sendError');
}

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
  if (!name) return t('contact.needName');
  if (!email) return t('contact.needEmail');
  if (!EMAIL_RE.test(email)) return t('errors.emailInvalid');
  if (!isContactCategory(values.category)) {
    return t('contact.needSubject');
  }
  if (!message) return t('contact.needMessage');
  if (message.length > 4000) {
    return t('contact.messageTooLong');
  }
  if (!values.consent) {
    return t('contact.needConsent');
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
    return { ok: false, code: 'captcha_failed', error: contactCaptchaError() };
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
  return (CONTACT_CATEGORY_IDS as readonly string[]).includes(value);
}

function messageForContactCode(code: string): string {
  if (code === 'captcha_failed') return contactCaptchaError();
  if (code === 'validation_failed') {
    return t('contact.validationFailed');
  }
  return contactSendError();
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
