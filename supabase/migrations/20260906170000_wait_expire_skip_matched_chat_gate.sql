-- 1) Expiration wait : si users_are_matched, pas de refus ni match_declined.
-- 2) insert_chat_message : refuse l’envoi hors Match (users_are_matched).

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
    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'refuse',
      'origin', COALESCE(existing_origin, NULLIF(v_origin, '')),
      'already', true
    );
  END IF;

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

CREATE OR REPLACE FUNCTION public.process_inbox_wait_expirations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_ttl interval := interval '3 months';
  c_warn interval := interval '7 days';
  r record;
  v_out jsonb;
  notified_users integer := 0;
  expired integer := 0;
  cleared_matched integer := 0;
  skipped integer := 0;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  FOR r IN
    SELECT DISTINCT ir.user_id
    FROM public.inbox_responses ir
    WHERE ir.decision = 'wait'
      AND ir.wait_started_at IS NOT NULL
      AND ir.wait_expiry_notified_at IS NULL
      AND ir.wait_started_at + c_ttl - c_warn <= now()
      AND ir.wait_started_at + c_ttl > now()
      AND NOT public.users_are_matched(ir.user_id, ir.actor_id)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.social_notifications sn
      WHERE sn.user_id = r.user_id
        AND sn.kind = 'match_wait_expiry'
        AND sn.read_at IS NULL
    ) THEN
      INSERT INTO public.social_notifications (
        user_id, kind, title, body, actor_id
      ) VALUES (
        r.user_id,
        'match_wait_expiry',
        'Attente bientôt expirée',
        'Tu as des profils en attente qui vont bientôt expirer, pense à les consulter.',
        NULL
      );
    END IF;

    UPDATE public.inbox_responses ir
    SET wait_expiry_notified_at = now()
    WHERE ir.user_id = r.user_id
      AND ir.decision = 'wait'
      AND ir.wait_expiry_notified_at IS NULL
      AND ir.wait_started_at IS NOT NULL
      AND ir.wait_started_at + c_ttl - c_warn <= now()
      AND ir.wait_started_at + c_ttl > now()
      AND NOT public.users_are_matched(ir.user_id, ir.actor_id);

    notified_users := notified_users + 1;
  END LOOP;

  FOR r IN
    SELECT ir.user_id, ir.actor_id, ir.origin
    FROM public.inbox_responses ir
    WHERE ir.decision = 'wait'
      AND ir.wait_started_at IS NOT NULL
      AND ir.wait_started_at + c_ttl <= now()
  LOOP
    BEGIN
      v_out := public.apply_inbox_refuse(r.user_id, r.actor_id, r.origin);
      IF COALESCE((v_out->>'cleared_matched')::boolean, false) THEN
        cleared_matched := cleared_matched + 1;
      ELSE
        expired := expired + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      skipped := skipped + 1;
      RAISE WARNING 'expire wait % → % : %', r.user_id, r.actor_id, SQLERRM;
    END;
  END LOOP;

  DELETE FROM public.social_notifications sn
  WHERE sn.kind = 'match_wait_expiry'
    AND sn.actor_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.inbox_responses ir
      WHERE ir.user_id = sn.user_id
        AND ir.decision = 'wait'
    );

  RETURN jsonb_build_object(
    'ok', true,
    'notified_users', notified_users,
    'expired', expired,
    'cleared_matched', cleared_matched,
    'skipped', skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_inbox_wait_expirations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_inbox_wait_expirations() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_inbox_wait_expirations() TO service_role;

CREATE OR REPLACE FUNCTION public.insert_chat_message(
  p_recipient uuid,
  p_content text
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  cleaned text := btrim(COALESCE(p_content, ''));
  a uuid;
  b uuid;
  conv_id uuid;
  row_out public.messages;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_recipient IS NULL OR p_recipient = me THEN
    RAISE EXCEPTION 'invalid_participant';
  END IF;
  IF cleaned = '' THEN
    RAISE EXCEPTION 'empty_message';
  END IF;
  IF public.profile_is_deactivated(p_recipient)
    OR public.profile_is_deactivated(me) THEN
    RAISE EXCEPTION 'member_unavailable';
  END IF;
  IF NOT public.users_are_matched(me, p_recipient) THEN
    RAISE EXCEPTION 'not_matched';
  END IF;

  a := LEAST(me, p_recipient);
  b := GREATEST(me, p_recipient);

  SELECT id INTO conv_id
  FROM public.conversations
  WHERE user_a = a AND user_b = b;

  IF conv_id IS NULL THEN
    INSERT INTO public.conversations (user_a, user_b)
    VALUES (a, b)
    ON CONFLICT (user_a, user_b) DO NOTHING;

    SELECT id INTO conv_id
    FROM public.conversations
    WHERE user_a = a AND user_b = b;
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, recipient_id, content)
  VALUES (conv_id, me, p_recipient, cleaned)
  RETURNING * INTO row_out;

  RETURN row_out;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_chat_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_chat_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_chat_message(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
