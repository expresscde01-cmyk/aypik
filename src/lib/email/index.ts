import { createEdgeEmailProvider } from './edgeProvider';
import { noopEmailProvider } from './noop';
import type { EmailMessage, EmailProvider, SendEmailResult } from './types';

export type {
  EmailMessage,
  EmailProvider,
  EmailTemplateId,
  SendEmailResult,
} from './types';
export { noopEmailProvider } from './noop';
export { createEdgeEmailProvider } from './edgeProvider';

/**
 * Sélection du fournisseur applicatif (pas Auth Supabase).
 * - `edge` / `resend` (défaut) : Edge Function `send-email` → Resend
 * - `noop` : aucun envoi (tests locaux sans clé)
 *
 * Config client : VITE_EMAIL_PROVIDER=edge|resend|noop
 * Secrets serveur : RESEND_API_KEY, RESEND_FROM_EMAIL (Edge Function)
 */
export function getEmailProvider(): EmailProvider {
  const mode = (import.meta.env.VITE_EMAIL_PROVIDER ?? 'edge').toLowerCase();
  if (mode === 'noop') return noopEmailProvider;
  // edge et resend pointent vers la même Edge Function modulaire
  return createEdgeEmailProvider('send-email');
}

/**
 * Envoi transactionnel / produit.
 * Préférer `notify*` (fire-and-forget) dans les flux UX critiques.
 */
export function sendTransactionalEmail(
  message: EmailMessage
): Promise<SendEmailResult> {
  return getEmailProvider().send(message);
}

function fireAndForget(message: EmailMessage): void {
  void sendTransactionalEmail(message).catch(() => {
    // Jamais bloquant pour l’UX / l’auth.
  });
}

/**
 * Accueil personnalisé après validation du profil (pas au moment du signUp).
 */
export function notifyWelcomeAfterProfile(params: {
  email: string;
  displayName?: string;
  isFounder?: boolean;
  siteUrl?: string;
}): void {
  const siteUrl =
    params.siteUrl ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  fireAndForget({
    to: params.email,
    template: params.isFounder ? 'welcome_founder' : 'welcome_profile',
    data: {
      displayName: params.displayName ?? null,
      source: 'profile_validated',
      ctaUrl: siteUrl || null,
      ctaLabel: 'Accéder à mon espace',
    },
  });
}

/** Alerte produit (nouveauté, tip, etc.) — prête à l’emploi. */
export function notifyProductAlert(params: {
  email: string;
  title: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): void {
  fireAndForget({
    to: params.email,
    template: 'product_alert',
    subject: params.title,
    data: {
      title: params.title,
      body: params.body,
      ctaUrl: params.ctaUrl ?? null,
      ctaLabel: params.ctaLabel ?? 'Voir sur Aypik',
    },
  });
}

/** Message communauté — prête à l’emploi. */
export function notifyCommunityAlert(params: {
  email: string;
  title: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): void {
  fireAndForget({
    to: params.email,
    template: 'community_alert',
    subject: params.title,
    data: {
      title: params.title,
      body: params.body,
      ctaUrl: params.ctaUrl ?? null,
      ctaLabel: params.ctaLabel ?? 'Ouvrir Aypik',
    },
  });
}

/**
 * @deprecated Préférer `notifyWelcomeAfterProfile` (après validation profil).
 * Conservé pour compatibilité — n’envoie plus au signUp pour éviter le double mail.
 */
export function notifySignupEmailHook(_params: {
  email: string;
  founderOpen?: boolean;
}): void {
  void _params;
  // Intentionnellement no-op : l’accueil Resend part après validation du profil.
}
