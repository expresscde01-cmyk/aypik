/**
 * @deprecated Les e-mails Flash / Like / Match partent désormais côté serveur
 * (pg_net → Edge Function send-social-email). Ne plus appeler depuis le client.
 */
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

/** No-op conservé pour compat éventuelle — l’envoi est serveur. */
export async function sendFlashReceivedEmail(
  _input: SendFlashEmailInput
): Promise<SendFlashEmailResult> {
  return {
    ok: true,
    skipped: true,
    skippedReason: 'server_side_dispatch',
    error: null,
  };
}
