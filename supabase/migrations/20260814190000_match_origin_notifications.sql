-- Match : l’émetteur voit « a matché ton Flash / ton Like ».
-- Accepter un Flash (sans like préalable) crée aussi un match_created.

CREATE OR REPLACE FUNCTION notify_on_mutual_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
  target_name text;
  had_like boolean := false;
  flash_row_id uuid;
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
  ) INTO had_like;

  SELECT f.id
  INTO flash_row_id
  FROM flashes f
  WHERE f.from_user = NEW.to_user
    AND f.to_user = NEW.from_user
  LIMIT 1;

  IF NOT had_like AND flash_row_id IS NULL THEN
    INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
    VALUES (
      NEW.to_user,
      'like_received',
      'Nouveau Like',
      actor_name || ' t''a envoyé un Like ❤️',
      NEW.from_user
    );
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO target_name
  FROM profiles
  WHERE id = NEW.to_user;

  -- Émetteur (Flash ou Like d’origine)
  INSERT INTO social_notifications (
    user_id, kind, title, body, actor_id, flash_id
  )
  VALUES (
    NEW.to_user,
    'match_created',
    'C’est un match !',
    CASE
      WHEN flash_row_id IS NOT NULL THEN actor_name || ' a matché ton Flash ⚡'
      ELSE actor_name || ' a matché ton Like ❤️'
    END,
    NEW.from_user,
    flash_row_id
  );

  -- Personne qui vient d’accepter / de liker en retour
  INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
  VALUES (
    NEW.from_user,
    'match_created',
    'C’est un match !',
    target_name || ' a matché.',
    NEW.to_user
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION notify_on_mutual_like() FROM PUBLIC;

-- Textes déjà stockés : Flash si l’utilisateur avait envoyé un flash à l’acteur.
UPDATE social_notifications sn
SET
  title = 'C’est un match !',
  body = COALESCE(
    (
      SELECT COALESCE(NULLIF(trim(p.display_name), ''), 'Quelqu’un')
      FROM profiles p
      WHERE p.id = sn.actor_id
    ),
    'Quelqu’un'
  ) || ' a matché ton Flash ⚡',
  flash_id = COALESCE(
    sn.flash_id,
    (
      SELECT f.id
      FROM flashes f
      WHERE f.from_user = sn.user_id
        AND f.to_user = sn.actor_id
      LIMIT 1
    )
  )
WHERE sn.kind = 'match_created'
  AND sn.actor_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM flashes f
    WHERE f.from_user = sn.user_id
      AND f.to_user = sn.actor_id
  );

UPDATE social_notifications sn
SET
  title = 'C’est un match !',
  body = COALESCE(
    (
      SELECT COALESCE(NULLIF(trim(p.display_name), ''), 'Quelqu’un')
      FROM profiles p
      WHERE p.id = sn.actor_id
    ),
    'Quelqu’un'
  ) || ' a matché ton Like ❤️'
WHERE sn.kind = 'match_created'
  AND sn.body NOT ILIKE '%a matché ton Flash%'
  AND (
    sn.body ILIKE '%a liké en retour%'
    OR sn.body ILIKE '%tu peux discuter%'
  )
  AND EXISTS (
    SELECT 1
    FROM likes l
    WHERE l.from_user = sn.user_id
      AND l.to_user = sn.actor_id
  );

UPDATE social_notifications sn
SET
  title = 'C’est un match !',
  body = COALESCE(
    (
      SELECT COALESCE(NULLIF(trim(p.display_name), ''), 'Quelqu’un')
      FROM profiles p
      WHERE p.id = sn.actor_id
    ),
    'Quelqu’un'
  ) || ' a matché.'
WHERE sn.kind = 'match_created'
  AND sn.body ILIKE '%t''a aussi liké%';

NOTIFY pgrst, 'reload schema';
