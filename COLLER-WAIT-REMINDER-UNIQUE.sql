-- Un seul rappel « En attente » par paire (plus de doublon test2 × 2).
-- Le digest cloche remplace l’affichage des lignes individuelles.
-- Coller TOUT ce fichier dans Supabase → SQL Editor, puis Run.

-- 1. Doublons non lus déjà en base : on garde la plus ancienne ligne.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, actor_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.social_notifications
  WHERE kind = 'match_wait_reminder'
    AND read_at IS NULL
)
DELETE FROM public.social_notifications
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Course « Attendre » deux fois : sérialiser l’insert, ignorer le doublon
--    sans faire échouer la décision wait.
CREATE OR REPLACE FUNCTION public.social_notifications_ignore_dup_wait_reminder()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM 'match_wait_reminder' THEN
    RETURN NEW;
  END IF;
  IF NEW.read_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.user_id::text),
    hashtext(COALESCE(NEW.actor_id::text, ''))
  );

  IF EXISTS (
    SELECT 1
    FROM public.social_notifications
    WHERE user_id = NEW.user_id
      AND actor_id = NEW.actor_id
      AND kind = 'match_wait_reminder'
      AND read_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS social_notifications_ignore_dup_wait_reminder
  ON public.social_notifications;
CREATE TRIGGER social_notifications_ignore_dup_wait_reminder
BEFORE INSERT ON public.social_notifications
FOR EACH ROW
EXECUTE FUNCTION public.social_notifications_ignore_dup_wait_reminder();

NOTIFY pgrst, 'reload schema';
