-- Like reçu : notification immédiate + vocabulaire « Like » (plus de « coup de cœur »).
-- Le destinataire voit le profil dans Tes matchs en attente de réponse.

CREATE OR REPLACE FUNCTION notify_on_mutual_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
  target_name text;
  is_mutual boolean := false;
BEGIN
  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO actor_name
  FROM profiles
  WHERE id = NEW.from_user;

  SELECT EXISTS (
    SELECT 1
    FROM likes
    WHERE from_user = NEW.to_user
      AND to_user = NEW.from_user
  ) INTO is_mutual;

  IF NOT is_mutual THEN
    INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
    VALUES (
      NEW.to_user,
      'like_received',
      'Nouveau like',
      actor_name || ' t''a envoyé un like ❤️',
      NEW.from_user
    );
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO target_name
  FROM profiles
  WHERE id = NEW.to_user;

  INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
  VALUES (
    NEW.to_user,
    'match_created',
    'C’est un match !',
    actor_name || ' a liké en retour — tu peux discuter.',
    NEW.from_user
  );

  INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
  VALUES (
    NEW.from_user,
    'match_created',
    'C’est un match !',
    target_name || ' t''a aussi liké — tu peux discuter.',
    NEW.to_user
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS likes_notify_on_match ON likes;
CREATE TRIGGER likes_notify_on_match
AFTER INSERT ON likes
FOR EACH ROW
EXECUTE FUNCTION notify_on_mutual_like();

REVOKE ALL ON FUNCTION notify_on_mutual_like() FROM PUBLIC;

-- Textes déjà stockés : « coup de cœur » → Like (cœur).
UPDATE social_notifications
SET
  kind = CASE
    WHEN kind = 'flash_received'
      AND (
        title ILIKE '%coup de cœur%'
        OR title ILIKE '%coup de coeur%'
        OR body ILIKE '%coup de cœur%'
        OR body ILIKE '%coup de coeur%'
      )
      THEN 'like_received'
    ELSE kind
  END,
  title = CASE
    WHEN title ILIKE '%coup de cœur%' OR title ILIKE '%coup de coeur%'
      THEN 'Nouveau like'
    ELSE title
  END,
  body = regexp_replace(
    regexp_replace(
      regexp_replace(
        body,
        ' t''a envoyé un coup de c[œe]ur[[:space:]]*[✨⚡❤️]?',
        ' t''a envoyé un like ❤️',
        'gi'
      ),
      ' vous a envoyé un coup de c[œe]ur[[:space:]]*[✨⚡❤️]?',
      ' t''a envoyé un like ❤️',
      'gi'
    ),
    'coup de c[œe]ur',
    'like',
    'gi'
  )
WHERE title ILIKE '%coup de cœur%'
   OR title ILIKE '%coup de coeur%'
   OR body ILIKE '%coup de cœur%'
   OR body ILIKE '%coup de coeur%';

UPDATE membership_notifications
SET body = replace(replace(body, 'coup de cœur', 'like'), 'coup de coeur', 'like')
WHERE body ILIKE '%coup de cœur%'
   OR body ILIKE '%coup de coeur%';

NOTIFY pgrst, 'reload schema';
