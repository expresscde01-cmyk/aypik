import type { EmailMessage, EmailProvider, SendEmailResult } from './types';

/**
 * Fournisseur par défaut : n’envoie rien.
 * L’inscription / auth restent 100 % fonctionnels sans SMTP externe.
 */
export const noopEmailProvider: EmailProvider = {
  name: 'noop',
  async send(message: EmailMessage): Promise<SendEmailResult> {
    if (import.meta.env.DEV) {
      console.info('[email:noop]', message.template, '→', message.to);
    }
    return { ok: true, skipped: true, id: 'noop' };
  },
};
