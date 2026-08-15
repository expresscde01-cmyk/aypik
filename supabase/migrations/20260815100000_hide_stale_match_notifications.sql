-- Masquer/supprimer les match_created obsolètes dès qu'un message a été échangé,
-- et fiabiliser l'origine Flash vs Like (flash_id + libellés).

CREATE OR REPLACE FUNCTION public.pair_has_messages(p_a uuid, p_b uuid)
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
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE (
          (m.sender_id = p_a AND m.recipient_id = p_b)
          OR (m.sender_id = p_b AND m.recipient_id = p_a)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.pair_has_messages(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pair_has_messages(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sweep_stale_social_notifications(p_actor uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  n integer := 0;
  n2 integer := 0;
BEGIN
  IF me IS NULL THEN
    RETURN 0;
  END IF;

  -- Flash / Like : masqués une fois matchés ou lus
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

  -- Match : obsolète dès qu'une conversation a démarré (évite doublon avec messages)
  DELETE FROM public.social_notifications sn
  WHERE sn.user_id = me
    AND sn.kind = 'match_created'
    AND (p_actor IS NULL OR sn.actor_id = p_actor)
    AND sn.actor_id IS NOT NULL
    AND public.pair_has_messages(sn.user_id, sn.actor_id);
  GET DIAGNOSTICS n2 = ROW_COUNT;

  RETURN n + n2;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_stale_social_notifications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_stale_social_notifications(uuid) TO authenticated;

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
    AND NOT (
      n.kind = 'match_created'
      AND n.actor_id IS NOT NULL
      AND public.pair_has_messages(n.user_id, n.actor_id)
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
    )
    AND NOT (
      n.kind = 'match_created'
      AND n.actor_id IS NOT NULL
      AND public.pair_has_messages(n.user_id, n.actor_id)
    );
$$;

REVOKE ALL ON FUNCTION public.count_unread_social_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unread_social_notifications() TO authenticated;

-- À la lecture d'un chat : retirer aussi le match_created (événement passé)
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
    AND kind IN ('flash_received', 'like_received', 'match_created');
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- Rattrapage : origin Flash/Like + suppression des matchs déjà en conversation
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
  AND (
    sn.flash_id IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM flashes f
      WHERE f.from_user = sn.user_id
        AND f.to_user = sn.actor_id
    )
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
  AND sn.actor_id IS NOT NULL
  AND sn.flash_id IS NULL
  AND sn.body NOT ILIKE '%a matché ton Flash%'
  AND sn.body NOT ILIKE '%a matché ton Like%'
  AND (
    sn.body ILIKE '%a liké en retour%'
    OR sn.body ILIKE '%tu peux discuter%'
    OR sn.body ILIKE '%a matché ton%'
    OR EXISTS (
      SELECT 1
      FROM likes l
      WHERE l.from_user = sn.user_id
        AND l.to_user = sn.actor_id
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM flashes f
    WHERE f.from_user = sn.user_id
      AND f.to_user = sn.actor_id
  );

DELETE FROM public.social_notifications sn
WHERE sn.kind = 'match_created'
  AND sn.actor_id IS NOT NULL
  AND public.pair_has_messages(sn.user_id, sn.actor_id);

NOTIFY pgrst, 'reload schema';
