-- Notifications match : glossaire CGU (Matché le / a matché ton Flash|Like)

CREATE OR REPLACE FUNCTION notify_on_mutual_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
  had_like boolean := false;
  flash_row_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO actor_name
  FROM profiles
  WHERE id = NEW.from_user;

  SELECT EXISTS (
    SELECT 1 FROM likes
    WHERE from_user = NEW.to_user AND to_user = NEW.from_user
  ) INTO had_like;

  SELECT f.id INTO flash_row_id
  FROM flashes f
  WHERE f.from_user = NEW.to_user AND f.to_user = NEW.from_user
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

  PERFORM public.ensure_match_bond(
    NEW.from_user,
    NEW.to_user,
    CASE WHEN flash_row_id IS NOT NULL THEN 'flash' ELSE 'like' END
  );

  DELETE FROM public.social_notifications
  WHERE kind IN ('flash_received', 'like_received')
    AND (
      (user_id = NEW.to_user AND actor_id = NEW.from_user)
      OR (user_id = NEW.from_user AND actor_id = NEW.to_user)
    );

  -- Émetteur d’origine : l’autre a répondu → « a matché ton Flash/Like »
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

  -- Accepteur (nous validons) → CGU « Matché le » (date formatée côté client)
  INSERT INTO social_notifications (user_id, kind, title, body, actor_id, flash_id)
  VALUES (
    NEW.from_user,
    'match_created',
    'Matché le',
    'Matché le',
    NEW.to_user,
    flash_row_id
  );

  IF flash_row_id IS NOT NULL AND NOT had_like THEN
    INSERT INTO likes (from_user, to_user)
    VALUES (NEW.to_user, NEW.from_user)
    ON CONFLICT (from_user, to_user) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION notify_on_mutual_like() FROM PUBLIC;

-- Rattrapage : anciennes notifs « X a matché. » → marqueur Matché le
UPDATE social_notifications sn
SET
  title = 'Matché le',
  body = 'Matché le'
WHERE sn.kind = 'match_created'
  AND sn.body ~* ' a matché\.?$'
  AND sn.body NOT ILIKE '%a matché ton%';

NOTIFY pgrst, 'reload schema';
