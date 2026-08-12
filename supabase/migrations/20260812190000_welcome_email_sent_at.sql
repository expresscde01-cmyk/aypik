/*
  Suivi d'envoi de l'e-mail de bienvenue Membre Fondateur (Resend).
*/

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;

COMMENT ON COLUMN memberships.welcome_email_sent_at IS
  'Horodatage de l''e-mail de bienvenue Fondateur envoyé via Resend.';
