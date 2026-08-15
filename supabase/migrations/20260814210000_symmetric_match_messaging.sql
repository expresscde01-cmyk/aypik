-- Match unique et symétrique : like OU flash de chaque côté = match.
-- Un Flash accepté matérialise aussi le like manquant de l’émetteur,
-- pour que likes croisés et messagerie soient identiques des deux côtés.

CREATE OR REPLACE FUNCTION public.users_are_matched(u1 uuid, u2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u1 IS DISTINCT FROM u2
    AND EXISTS (
      SELECT 1
      FROM profiles p1
      JOIN profiles p2 ON p2.id = u2
      WHERE p1.id = u1
        AND public.dating_partner_old_enough(p1.birth_date, p2.birth_date)
        AND public.dating_partner_old_enough(p2.birth_date, p1.birth_date)
    )
    AND (
      EXISTS (
        SELECT 1 FROM likes WHERE from_user = u1 AND to_user = u2
      )
      OR EXISTS (
        SELECT 1 FROM flashes WHERE from_user = u1 AND to_user = u2
      )
    )
    AND (
      EXISTS (
        SELECT 1 FROM likes WHERE from_user = u2 AND to_user = u1
      )
      OR EXISTS (
        SELECT 1 FROM flashes WHERE from_user = u2 AND to_user = u1
      )
    );
$$;

REVOKE ALL ON FUNCTION public.users_are_matched(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.users_are_matched(uuid, uuid) TO authenticated;

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
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

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

  INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
  VALUES (
    NEW.from_user,
    'match_created',
    'C’est un match !',
    target_name || ' a matché.',
    NEW.to_user
  );

  -- Flash accepté : le like de l’émetteur est implicite (un seul match, des deux côtés).
  IF flash_row_id IS NOT NULL AND NOT had_like THEN
    INSERT INTO likes (from_user, to_user)
    VALUES (NEW.to_user, NEW.from_user)
    ON CONFLICT (from_user, to_user) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION notify_on_mutual_like() FROM PUBLIC;

-- Rattrapage : Flash déjà accepté sans like de l’émetteur.
ALTER TABLE likes DISABLE TRIGGER likes_notify_on_match;

INSERT INTO likes (from_user, to_user)
SELECT f.from_user, f.to_user
FROM flashes f
WHERE EXISTS (
  SELECT 1 FROM likes l
  WHERE l.from_user = f.to_user
    AND l.to_user = f.from_user
)
AND NOT EXISTS (
  SELECT 1 FROM likes l
  WHERE l.from_user = f.from_user
    AND l.to_user = f.to_user
)
ON CONFLICT (from_user, to_user) DO NOTHING;

ALTER TABLE likes ENABLE TRIGGER likes_notify_on_match;

NOTIFY pgrst, 'reload schema';
