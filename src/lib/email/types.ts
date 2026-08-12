/**
 * Couche e-mail découplée de l’authentification.
 *
 * - Auth (confirm, reset) : gérée par Supabase Auth / SMTP projet — pas ici.
 * - E-mails produit (welcome, alertes, communauté) : EmailProvider → Resend
 *   via Edge Function `send-email` (clé API serveur uniquement).
 *
 * Aucun envoi ne doit bloquer l’inscription : les appels sont fire-and-forget.
 */

export type EmailTemplateId =
  | 'welcome_founder'
  | 'welcome_freemium'
  | 'welcome_profile'
  | 'product_alert'
  | 'community_alert'
  | 'generic';

export type EmailMessage = {
  to: string;
  template: EmailTemplateId;
  subject?: string;
  /** Variables de template (jamais de secrets). */
  data?: Record<string, string | number | boolean | null>;
};

export type SendEmailResult =
  | { ok: true; id?: string; skipped?: boolean }
  | { ok: false; error: string; skipped?: boolean };

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<SendEmailResult>;
}
