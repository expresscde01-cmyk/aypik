/*
# Préférences de communication e-mail

Ajoute `profiles.email_notifications_enabled` (défaut true)
pour permettre l’opt-out des e-mails transactionnels / notifications.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.email_notifications_enabled IS
  'Si false, aucun e-mail de notification (welcome, flash, etc.) ne doit être envoyé via Resend.';
