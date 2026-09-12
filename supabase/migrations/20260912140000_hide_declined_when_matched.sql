-- Un pair déjà matché ne doit plus apparaître en Like/Flash reçu ni en
-- « Pas cette fois » (match_declined). pair_has_match inclut la décision inbox.

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
        FROM public.inbox_responses ir
        WHERE ir.decision = 'match'
          AND (
            (ir.user_id = p_a AND ir.actor_id = p_b)
            OR (ir.user_id = p_b AND ir.actor_id = p_a)
          )
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
  n integer := 0;
  n2 integer := 0;
  n3 integer := 0;
  n4 integer := 0;
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

  DELETE FROM public.social_notifications sn
  WHERE sn.user_id = me
    AND sn.kind = 'match_created'
    AND (p_actor IS NULL OR sn.actor_id = p_actor)
    AND sn.actor_id IS NOT NULL
    AND public.pair_has_messages(sn.user_id, sn.actor_id);
  GET DIAGNOSTICS n2 = ROW_COUNT;

  DELETE FROM public.social_notifications sn
  WHERE sn.user_id = me
    AND sn.kind IN ('match_waiting', 'match_wait_reminder')
    AND (p_actor IS NULL OR sn.actor_id = p_actor)
    AND sn.actor_id IS NOT NULL
    AND public.pair_has_match(sn.user_id, sn.actor_id);
  GET DIAGNOSTICS n3 = ROW_COUNT;

  DELETE FROM public.social_notifications sn
  WHERE sn.user_id = me
    AND sn.kind = 'match_declined'
    AND (p_actor IS NULL OR sn.actor_id = p_actor)
    AND sn.actor_id IS NOT NULL
    AND public.pair_has_match(sn.user_id, sn.actor_id);
  GET DIAGNOSTICS n4 = ROW_COUNT;

  RETURN n + n2 + n3 + n4;
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
      n.kind IN ('match_waiting', 'match_wait_reminder')
      AND n.actor_id IS NOT NULL
      AND public.pair_has_match(n.user_id, n.actor_id)
    )
    AND NOT (
      n.kind = 'match_created'
      AND n.actor_id IS NOT NULL
      AND public.pair_has_messages(n.user_id, n.actor_id)
    )
    AND NOT (
      n.kind = 'match_declined'
      AND n.actor_id IS NOT NULL
      AND public.pair_has_match(n.user_id, n.actor_id)
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
      n.kind IN ('match_waiting', 'match_wait_reminder')
      AND n.actor_id IS NOT NULL
      AND public.pair_has_match(n.user_id, n.actor_id)
    )
    AND NOT (
      n.kind = 'match_created'
      AND n.actor_id IS NOT NULL
      AND public.pair_has_messages(n.user_id, n.actor_id)
    )
    AND NOT (
      n.kind = 'match_declined'
      AND n.actor_id IS NOT NULL
      AND public.pair_has_match(n.user_id, n.actor_id)
    );
$$;

REVOKE ALL ON FUNCTION public.count_unread_social_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unread_social_notifications() TO authenticated;

DELETE FROM public.social_notifications sn
WHERE sn.kind = 'match_declined'
  AND sn.actor_id IS NOT NULL
  AND public.pair_has_match(sn.user_id, sn.actor_id);
