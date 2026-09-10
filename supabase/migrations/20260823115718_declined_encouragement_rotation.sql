-- Le texte d’encouragement des refus Like/Flash est désormais choisi
-- côté front (rotation sans remise). On retire l’ancienne phrase fixe
-- des notifications déjà stockées. Rejouer COLLER-INBOX-ATTENTE.sql
-- pour que les nouveaux INSERT n’ajoutent plus cette phrase.

UPDATE public.social_notifications
SET body = regexp_replace(
  body,
  '\s*Continue tes recherches\.\.\. Ne te décourage pas\s*!?$',
  ''
)
WHERE kind = 'match_declined'
  AND body ~ 'Continue tes recherches';

NOTIFY pgrst, 'reload schema';
