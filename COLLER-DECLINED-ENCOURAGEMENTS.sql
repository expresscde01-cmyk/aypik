-- Coller TOUT ce fichier dans Supabase → SQL Editor, puis Run.
-- Puis rejouer COLLER-INBOX-ATTENTE.sql pour les nouveaux refus.
-- Les phrases d’encouragement sont choisies dans l’app (rotation sans remise).

UPDATE public.social_notifications
SET body = regexp_replace(
  body,
  '\s*Continue tes recherches\.\.\. Ne te décourage pas\s*!?$',
  ''
)
WHERE kind = 'match_declined'
  AND body ~ 'Continue tes recherches';

NOTIFY pgrst, 'reload schema';
