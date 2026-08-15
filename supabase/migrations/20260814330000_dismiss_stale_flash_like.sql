-- Flash / Like périmés : plus dans la cloche une fois matchés, lus, ou après lecture du chat.

CREATE OR REPLACE FUNCTION public.pair_has_match(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_a IS NOT NULL
    AND p_b IS NOT NULL
    AND p_a IS DISTINCT FROM p_b
    AND (
      EXISTS (
        SELECT 1
        FROM public.likes a
        JOIN public.likes b
          ON b.from_user = a.to_user
         AND b.to_user = a.from_user
        WHERE a.from_user = p_a
          AND a.to_user = p_b
      )
      OR EXISTS (
        SELECT 1
        FROM public.match_bonds mb
        WHERE mb.user_a = LEAST(p_a, p_b)
          AND mb.user_b = GREATEST(p_a, p_b)
      )
      OR EXISTS (
        SELECT 1
        FROM public.social_notifications m
        WHERE m.kind = 'match_created'
          AND (
            (m.user_id = p_a AND m.actor_id = p_b)
            OR (m.user_id = p_b AND m.actor_id = p_a)
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.pair_has_match(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pair_has_match(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sweep_stale_social_notifications(p_actor uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  n integer;
BEGIN
  IF me IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.social_notifications sn
  WHERE sn.user_id = me
    AND sn.kind IN ('flash_received', 'like_received')
    AND (p_actor IS NULL OR sn.actor_id = p_actor)
    AND (
      sn.read_at IS NOT NULL
      OR sn.actor_id IS NULL
      OR public.pair_has_match(sn.user_id, sn.actor_id)
    );

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_stale_social_notifications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_stale_social_notifications(uuid) TO authenticated;

-- Rattrapage : Bernard / tout Flash-Like déjà matché.
DELETE FROM public.social_notifications sn
WHERE sn.kind IN ('flash_received', 'like_received')
  AND sn.actor_id IS NOT NULL
  AND public.pair_has_match(sn.user_id, sn.actor_id);

CREATE OR REPLACE FUNCTION public.get_my_social_notifications(p_limit integer DEFAULT 30)
RETURNS SETOF social_notifications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.*
  FROM social_notifications n
  LEFT JOIN profiles actor ON actor.id = n.actor_id
  JOIN profiles me ON me.id = auth.uid()
  WHERE n.user_id = auth.uid()
    AND (
      n.actor_id IS NULL
      OR public.dating_partner_old_enough(me.birth_date, actor.birth_date)
    )
    AND NOT (
      n.kind IN ('flash_received', 'like_received')
      AND (
        n.read_at IS NOT NULL
        OR n.actor_id IS NULL
        OR public.pair_has_match(n.user_id, n.actor_id)
      )
    )
  ORDER BY n.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 30), 1);
$$;

REVOKE ALL ON FUNCTION public.get_my_social_notifications(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_social_notifications(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_unread_social_notifications()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM social_notifications n
  LEFT JOIN profiles actor ON actor.id = n.actor_id
  JOIN profiles me ON me.id = auth.uid()
  WHERE n.user_id = auth.uid()
    AND n.read_at IS NULL
    AND n.kind <> 'message_received'
    AND (
      n.actor_id IS NULL
      OR public.dating_partner_old_enough(me.birth_date, actor.birth_date)
    )
    AND NOT (
      n.kind IN ('flash_received', 'like_received')
      AND n.actor_id IS NOT NULL
      AND public.pair_has_match(n.user_id, n.actor_id)
    );
$$;

REVOKE ALL ON FUNCTION public.count_unread_social_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unread_social_notifications() TO authenticated;

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

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO target_name
  FROM profiles
  WHERE id = NEW.to_user;

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

  IF flash_row_id IS NOT NULL AND NOT had_like THEN
    INSERT INTO likes (from_user, to_user)
    VALUES (NEW.to_user, NEW.from_user)
    ON CONFLICT (from_user, to_user) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION notify_on_mutual_like() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  other_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT CASE WHEN c.user_a = me THEN c.user_b ELSE c.user_a END
  INTO other_id
  FROM public.conversations c
  WHERE c.id = p_conversation_id
    AND (c.user_a = me OR c.user_b = me);

  IF other_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND recipient_id = me
    AND read_at IS NULL;

  UPDATE public.social_notifications
  SET read_at = now()
  WHERE user_id = me
    AND kind = 'message_received'
    AND actor_id = other_id
    AND read_at IS NULL;

  DELETE FROM public.social_notifications
  WHERE user_id = me
    AND actor_id = other_id
    AND kind IN ('flash_received', 'like_received');
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
