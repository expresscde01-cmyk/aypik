-- Rappel unique à la mise en attente (libellé CTA).
-- Le RPC respond_to_inbox_interest est mis à jour via COLLER-INBOX-ATTENTE.sql.

UPDATE public.social_notifications
SET
  title = 'En attente',
  body = 'Ne laisse pas ce membre dans l''attente.'
WHERE kind = 'match_wait_reminder';
