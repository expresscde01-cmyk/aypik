import { createEdgeEmailProvider } from './edgeProvider';
import { noopEmailProvider } from './noop';
import type { EmailMessage, EmailProvider, SendEmailResult } from './types';

export type { EmailMessage, EmailProvider, EmailTemplateId, SendEmailResult } from './types';
export { noopEmailProvider } from './noop';

/**
 * Sélection du fournisseur.
 * - `noop` (défaut) : aucun envoi, auth non bridée
 * - `edge` : appelle la Edge Function `send-email` si déployée
 *
 * Config : VITE_EMAIL_PROVIDER=noop|edge
 * Brancher Resend/SendGrid côté Edge Function, pas dans le client.
 */
export function getEmailProvider(): EmailProvider {
  const mode = (import.meta.env.VITE_EMAIL_PROVIDER ?? 'noop').toLowerCase();
  if (mode === 'edge') return createEdgeEmailProvider();
  return noopEmailProvider;
}

/**
 * Envoi transactionnel non bloquant.
 * Ne jamais `await` dans le chemin critique d’inscription / login.
 */
export function sendTransactionalEmail(
  message: EmailMessage
): Promise<SendEmailResult> {
  return getEmailProvider().send(message);
}

/**
 * Hook produit optionnel après signup (fire-and-forget).
 * N’interrompt jamais le flux auth, même si le provider échoue.
 */
export function notifySignupEmailHook(params: {
  email: string;
  founderOpen?: boolean;
}): void {
  void sendTransactionalEmail({
    to: params.email,
    template: params.founderOpen ? 'welcome_founder' : 'welcome_freemium',
    data: { source: 'signup' },
  }).catch(() => {
    // Intentionnellement ignoré : l’auth ne dépend pas de l’e-mail produit.
  });
}
