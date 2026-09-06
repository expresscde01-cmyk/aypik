-- Refus : retire le like/flash ENTRANT de l’auteur (actor → moi).
-- Ne touche pas un like du refuseur vers l’auteur.
-- Wait/refuse/match : si la paire est déjà matchée, no-op {already:true}.
-- Rattrapage : les refus déjà en base perdent aussi le signal dormant.
--
-- Coller TOUT ce fichier, puis Run.
-- Ensuite, second Run : COLLER-TEST-REFUSE-INTEREST.sql
-- Pas encore collé en prod.

CREATE OR REPLACE FUNCTION public.apply_inbox_refuse(
  p_user uuid,
  p_actor uuid,
  p_origin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origin text := lower(btrim(COALESCE(p_origin, '')));
  existing_decision text;
  existing_origin text;
  has_flash boolean := false;
  has_like boolean := false;
  my_name text;
  origin_label text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF p_user IS NULL OR p_actor IS NULL OR p_user = p_actor THEN
    RAISE EXCEPTION 'invalid_actor';
  END IF;

  SELECT ir.decision, ir.origin
  INTO existing_decision, existing_origin
  FROM public.inbox_responses ir
  WHERE ir.user_id = p_user AND ir.actor_id = p_actor;

  IF existing_decision = 'match' THEN
    RAISE EXCEPTION 'decision_locked_match';
  END IF;

  IF existing_decision = 'refuse' THEN
    DELETE FROM public.likes
    WHERE from_user = p_actor AND to_user = p_user;
    DELETE FROM public.flashes
    WHERE from_user = p_actor AND to_user = p_user;
    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'refuse',
      'origin', COALESCE(existing_origin, NULLIF(v_origin, '')),
      'already', true
    );
  END IF;

  -- Match réel (bond / likes ou flashes croisés) : ne jamais refuser.
  -- Ligne wait obsolète → match, sans notification match_declined.
  IF public.users_are_matched(p_user, p_actor) THEN
    UPDATE public.inbox_responses
    SET
      decision = 'match',
      updated_at = now()
    WHERE user_id = p_user
      AND actor_id = p_actor
      AND decision = 'wait';

    DELETE FROM public.social_notifications
    WHERE user_id = p_user
      AND actor_id = p_actor
      AND kind IN ('match_wait_reminder', 'match_wait_expiry');

    DELETE FROM public.social_notifications
    WHERE user_id = p_actor
      AND actor_id = p_user
      AND kind IN ('match_waiting', 'match_wait_reminder')
      AND read_at IS NULL;

    PERFORM public.prune_inbox_wait_expiry_digest(p_user);

    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'match',
      'cleared_matched', true,
      'origin', COALESCE(existing_origin, NULLIF(v_origin, ''), 'like')
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.flashes
    WHERE from_user = p_actor AND to_user = p_user
  ) INTO has_flash;

  SELECT EXISTS (
    SELECT 1 FROM public.likes
    WHERE from_user = p_actor AND to_user = p_user
  ) INTO has_like;

  IF existing_origin IN ('flash', 'like') THEN
    v_origin := existing_origin;
  ELSIF v_origin NOT IN ('flash', 'like') THEN
    v_origin := CASE WHEN has_flash THEN 'flash' ELSE 'like' END;
  ELSIF v_origin = 'flash' AND NOT has_flash AND has_like THEN
    v_origin := 'like';
  ELSIF v_origin = 'like' AND NOT has_like AND has_flash THEN
    v_origin := 'flash';
  END IF;

  IF v_origin NOT IN ('flash', 'like') THEN
    v_origin := 'like';
  END IF;

  INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
  VALUES (p_user, p_actor, 'refuse', v_origin)
  ON CONFLICT (user_id, actor_id) DO UPDATE
  SET
    decision = 'refuse',
    origin = EXCLUDED.origin,
    updated_at = now()
  WHERE public.inbox_responses.decision IS DISTINCT FROM 'match'
    AND public.inbox_responses.decision IS DISTINCT FROM 'refuse';

  DELETE FROM public.likes
  WHERE from_user = p_actor AND to_user = p_user;
  DELETE FROM public.flashes
  WHERE from_user = p_actor AND to_user = p_user;

  origin_label := CASE WHEN v_origin = 'flash' THEN 'Flash' ELSE 'Like' END;

  SELECT display_name INTO my_name
  FROM public.profiles
  WHERE id = p_user;
  my_name := COALESCE(NULLIF(btrim(my_name), ''), 'Quelqu’un');

  DELETE FROM public.social_notifications
  WHERE user_id = p_user
    AND actor_id = p_actor
    AND kind IN (
      'flash_received',
      'like_received',
      'match_wait_reminder',
      'match_wait_expiry'
    );

  DELETE FROM public.social_notifications
  WHERE user_id = p_actor
    AND actor_id = p_user
    AND kind IN ('match_declined', 'match_waiting', 'match_wait_reminder')
    AND read_at IS NULL;

  INSERT INTO public.social_notifications (
    user_id, kind, title, body, actor_id
  ) VALUES (
    p_actor,
    'match_declined',
    'Pas cette fois',
    my_name || ' a décliné ton ' || origin_label || '.',
    p_user
  );

  PERFORM public.prune_inbox_wait_expiry_digest(p_user);

  RETURN jsonb_build_object(
    'ok', true,
    'decision', 'refuse',
    'origin', v_origin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_inbox_refuse(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_inbox_refuse(uuid, uuid, text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_inbox_interest(
  p_actor uuid,
  p_decision text,
  p_origin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_name text;
  actor_name text;
  v_decision text := lower(btrim(COALESCE(p_decision, '')));
  v_origin text := lower(btrim(COALESCE(p_origin, '')));
  has_flash boolean := false;
  has_like boolean := false;
  existing_decision text;
  existing_origin text;
  origin_label text;
  de_actor text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_actor IS NULL OR p_actor = me THEN
    RAISE EXCEPTION 'invalid_actor';
  END IF;
  IF v_decision NOT IN ('wait', 'refuse', 'match', 'reset') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  IF v_decision IN ('wait', 'refuse', 'match')
     AND public.users_are_matched(me, p_actor) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'match',
      'already', true
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.flashes
    WHERE from_user = p_actor AND to_user = me
  ) INTO has_flash;

  SELECT EXISTS (
    SELECT 1 FROM public.likes
    WHERE from_user = p_actor AND to_user = me
  ) INTO has_like;

  IF NOT has_flash AND NOT has_like THEN
    RAISE EXCEPTION 'no_incoming_interest';
  END IF;

  IF v_origin NOT IN ('flash', 'like') THEN
    v_origin := CASE WHEN has_flash THEN 'flash' ELSE 'like' END;
  ELSIF v_origin = 'flash' AND NOT has_flash AND has_like THEN
    v_origin := 'like';
  ELSIF v_origin = 'like' AND NOT has_like AND has_flash THEN
    v_origin := 'flash';
  END IF;

  SELECT display_name INTO my_name
  FROM public.profiles
  WHERE id = me;
  my_name := COALESCE(NULLIF(btrim(my_name), ''), 'Quelqu’un');

  SELECT ir.decision, ir.origin
  INTO existing_decision, existing_origin
  FROM public.inbox_responses ir
  WHERE ir.user_id = me AND ir.actor_id = p_actor;

  IF existing_origin IN ('flash', 'like') THEN
    v_origin := existing_origin;
  END IF;

  IF v_decision = 'reset' THEN
    IF existing_decision IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'decision', 'reset', 'already', true);
    END IF;
    IF existing_decision = 'match' THEN
      RAISE EXCEPTION 'decision_locked_match';
    END IF;
    IF existing_decision IS DISTINCT FROM 'wait' THEN
      RETURN jsonb_build_object('ok', true, 'decision', 'reset', 'already', true);
    END IF;

    DELETE FROM public.inbox_responses
    WHERE user_id = me AND actor_id = p_actor AND decision = 'wait';

    DELETE FROM public.social_notifications
    WHERE user_id = me
      AND actor_id = p_actor
      AND kind IN ('match_wait_reminder', 'match_wait_expiry');

    DELETE FROM public.social_notifications
    WHERE user_id = p_actor
      AND actor_id = me
      AND kind IN ('match_waiting', 'match_wait_reminder')
      AND read_at IS NULL;

    SELECT display_name INTO actor_name
    FROM public.profiles
    WHERE id = p_actor;
    actor_name := COALESCE(NULLIF(btrim(actor_name), ''), 'Quelqu’un');

    IF NOT EXISTS (
      SELECT 1
      FROM public.social_notifications
      WHERE user_id = me
        AND actor_id = p_actor
        AND kind IN ('flash_received', 'like_received')
    ) THEN
      INSERT INTO public.social_notifications (
        user_id, kind, title, body, actor_id
      ) VALUES (
        me,
        CASE WHEN v_origin = 'flash' THEN 'flash_received' ELSE 'like_received' END,
        CASE WHEN v_origin = 'flash' THEN 'Nouveau Flash' ELSE 'Nouveau like' END,
        actor_name || CASE
          WHEN v_origin = 'flash' THEN ' t''a envoyé un flash'
          ELSE ' t''a envoyé un like'
        END,
        p_actor
      );
    END IF;

    PERFORM public.prune_inbox_wait_expiry_digest(me);

    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'reset',
      'origin', v_origin
    );
  END IF;

  IF existing_decision IS NOT NULL THEN
    IF existing_decision = 'refuse' THEN
      RAISE EXCEPTION 'decision_locked_refuse';
    END IF;
    IF existing_decision = 'match' THEN
      RAISE EXCEPTION 'decision_locked_match';
    END IF;
    IF existing_decision = 'wait' AND v_decision = 'wait' THEN
      RAISE EXCEPTION 'decision_locked_wait';
    END IF;
    IF existing_origin IN ('flash', 'like') THEN
      v_origin := existing_origin;
    END IF;
  END IF;

  IF existing_decision IS NOT NULL AND existing_decision = v_decision THEN
    RETURN jsonb_build_object(
      'ok', true,
      'decision', v_decision,
      'origin', COALESCE(NULLIF(v_origin, ''), existing_origin),
      'locked', true
    );
  END IF;

  IF v_decision = 'refuse' THEN
    RETURN public.apply_inbox_refuse(me, p_actor, v_origin);
  END IF;

  INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
  VALUES (me, p_actor, v_decision, v_origin)
  ON CONFLICT (user_id, actor_id) DO UPDATE
  SET
    decision = EXCLUDED.decision,
    origin = EXCLUDED.origin,
    updated_at = now()
  WHERE public.inbox_responses.decision IS DISTINCT FROM 'refuse'
    AND public.inbox_responses.decision IS DISTINCT FROM 'match'
    AND (
      public.inbox_responses.decision IS DISTINCT FROM 'wait'
      OR EXCLUDED.decision IN ('match', 'refuse')
    );

  IF v_decision = 'match' THEN
    INSERT INTO public.likes (from_user, to_user)
    VALUES (me, p_actor)
    ON CONFLICT DO NOTHING;

    UPDATE public.inbox_responses
    SET
      decision = 'match',
      updated_at = now()
    WHERE user_id = p_actor
      AND actor_id = me
      AND decision IS DISTINCT FROM 'match'
      AND decision IS DISTINCT FROM 'refuse';

    DELETE FROM public.social_notifications
    WHERE kind IN ('match_waiting', 'match_wait_reminder')
      AND read_at IS NULL
      AND (
        (user_id = me AND actor_id = p_actor)
        OR (user_id = p_actor AND actor_id = me)
      );

    DELETE FROM public.social_notifications
    WHERE user_id = me
      AND actor_id = p_actor
      AND kind IN (
        'flash_received',
        'like_received',
        'match_wait_expiry'
      );

    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'match',
      'origin', v_origin
    );
  END IF;

  IF v_decision = 'wait' THEN
    origin_label := CASE WHEN v_origin = 'flash' THEN 'Flash' ELSE 'Like' END;

    SELECT display_name INTO actor_name
    FROM public.profiles
    WHERE id = p_actor;
    actor_name := COALESCE(NULLIF(btrim(actor_name), ''), 'Quelqu’un');
    de_actor := CASE
      WHEN lower(substr(actor_name, 1, 1)) IN (
        'a','e','i','o','u','y','à','â','ä','é','è','ê','ë','ï','î','ô','ù','û','ü','h'
      ) THEN 'd''' || actor_name
      ELSE 'de ' || actor_name
    END;

    DELETE FROM public.social_notifications
    WHERE user_id = me
      AND actor_id = p_actor
      AND kind IN (
        'flash_received',
        'like_received',
        'match_wait_reminder',
        'match_wait_expiry'
      );

    DELETE FROM public.social_notifications
    WHERE user_id = p_actor
      AND actor_id = me
      AND kind IN ('match_waiting', 'match_wait_reminder')
      AND read_at IS NULL;

    INSERT INTO public.social_notifications (
      user_id, kind, title, body, actor_id
    ) VALUES (
      p_actor,
      'match_waiting',
      'En attente',
      my_name || ' a mis ton ' || origin_label || ' en attente',
      me
    );

    INSERT INTO public.social_notifications (
      user_id, kind, title, body, actor_id
    ) VALUES (
      me,
      'match_wait_reminder',
      'En attente',
      'Ne laisse pas ' || actor_name || ' dans l''attente.',
      p_actor
    );

    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'wait',
      'origin', v_origin
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'invalid_decision');
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_inbox_interest(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_inbox_interest(uuid, text, text) TO authenticated;

-- Refus déjà enregistrés : même nettoyage (signal actor → refuseur seulement).
DELETE FROM public.likes l
USING public.inbox_responses ir
WHERE ir.decision = 'refuse'
  AND l.from_user = ir.actor_id
  AND l.to_user = ir.user_id;

DELETE FROM public.flashes f
USING public.inbox_responses ir
WHERE ir.decision = 'refuse'
  AND f.from_user = ir.actor_id
  AND f.to_user = ir.user_id;

NOTIFY pgrst, 'reload schema';
