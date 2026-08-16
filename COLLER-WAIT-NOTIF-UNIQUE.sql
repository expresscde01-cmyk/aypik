-- Un seul rappel « mise en attente » (plus de doublon statut + digest).
-- À coller dans l’éditeur SQL Supabase, puis coller aussi COLLER-INBOX-ATTENTE.sql
-- pour mettre à jour respond_to_inbox_interest.

UPDATE public.social_notifications
SET
  title = 'En attente',
  body = 'Ne laisse pas ce membre dans l''attente.'
WHERE kind = 'match_wait_reminder';

NOTIFY pgrst, 'reload schema';
