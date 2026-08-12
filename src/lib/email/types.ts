export type SendWelcomeEmailInput = {
  displayName?: string;
};

export type SendWelcomeEmailResult = {
  ok: boolean;
  alreadySent?: boolean;
  skipped?: boolean;
  /** Ex. email_notifications_disabled */
  skippedReason?: string | null;
  error?: string | null;
  id?: string | null;
};
