-- Expiration automatique des profils « mis en attente » (3 mois),
-- avec rappel in-app 7 jours avant. Même refus que le bouton manuel.
-- Coller aussi dans l’éditeur SQL : COLLER-INBOX-WAIT-EXPIRATION.sql
-- Job pg_cron expire-inbox-waits à 03:30 UTC. Fallback :
--   SELECT public.process_inbox_wait_expirations();

ALTER TABLE public.inbox_responses
  ADD COLUMN IF NOT EXISTS wait_started_at timestamptz;

ALTER TABLE public.inbox_responses
  ADD COLUMN IF NOT EXISTS wait_expiry_notified_at timestamptz;

UPDATE public.inbox_responses
SET wait_started_at = COALESCE(wait_started_at, updated_at, created_at)
WHERE decision = 'wait'
  AND wait_started_at IS NULL;

CREATE INDEX IF NOT EXISTS inbox_responses_wait_started_idx
  ON public.inbox_responses (wait_started_at)
  WHERE decision = 'wait';

-- Horloge 3 mois : nouveau wait, ou retour à wait depuis un autre statut.
CREATE OR REPLACE FUNCTION public.inbox_responses_touch_wait_clock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.decision = 'wait' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.wait_started_at := COALESCE(NEW.wait_started_at, now());
      NEW.wait_expiry_notified_at := NULL;
    ELSIF OLD.decision IS DISTINCT FROM 'wait' THEN
      NEW.wait_started_at := now();
      NEW.wait_expiry_notified_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inbox_responses_wait_clock ON public.inbox_responses;
CREATE TRIGGER inbox_responses_wait_clock
BEFORE INSERT OR UPDATE OF decision ON public.inbox_responses
FOR EACH ROW
EXECUTE FUNCTION public.inbox_responses_touch_wait_clock();

ALTER TABLE public.social_notifications
  DROP CONSTRAINT IF EXISTS social_notifications_kind_check;

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_kind_check
  CHECK (kind IN (
    'flash_received',
    'like_received',
    'match_created',
    'message_received',
    'match_waiting',
    'match_declined',
    'match_wait_reminder',
    'match_wait_expiry'
  ));

-- Refus unique (manuel et expiration). Pas d'auth.uid : le cron l'appelle
-- au nom de p_user. respond_to_inbox_interest reste le garde d'accès membre.
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

-- Digest J-7 (actor_id NULL) : retirer s’il ne reste plus aucun wait.
CREATE OR REPLACE FUNCTION public.prune_inbox_wait_expiry_digest(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.inbox_responses
    WHERE user_id = p_user
      AND decision = 'wait'
  ) THEN
    RETURN;
  END IF;
  DELETE FROM public.social_notifications
  WHERE user_id = p_user
    AND kind = 'match_wait_expiry'
    AND actor_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_inbox_wait_expiry_digest(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_inbox_wait_expiry_digest(uuid) FROM anon, authenticated;

-- Job quotidien : rappel J-7 puis refus à 3 mois.
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
  notified_users integer := 0;
  expired integer := 0;
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

    UPDATE public.inbox_responses
    SET wait_expiry_notified_at = now()
    WHERE user_id = r.user_id
      AND decision = 'wait'
      AND wait_expiry_notified_at IS NULL
      AND wait_started_at IS NOT NULL
      AND wait_started_at + c_ttl - c_warn <= now()
      AND wait_started_at + c_ttl > now();

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
      PERFORM public.apply_inbox_refuse(r.user_id, r.actor_id, r.origin);
      expired := expired + 1;
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
    'skipped', skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_inbox_wait_expirations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_inbox_wait_expirations() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_inbox_wait_expirations() TO service_role;

-- respond_to_inbox_interest : le refus passe par apply_inbox_refuse.
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

CREATE OR REPLACE FUNCTION public.restore_inbox_wait(
  p_actor uuid,
  p_origin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  v_origin text := lower(btrim(COALESCE(p_origin, '')));
  existing_decision text;
  existing_origin text;
  has_flash boolean := false;
  has_like boolean := false;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_actor IS NULL OR p_actor = me THEN
    RAISE EXCEPTION 'invalid_actor';
  END IF;

  SELECT ir.decision, ir.origin
  INTO existing_decision, existing_origin
  FROM public.inbox_responses ir
  WHERE ir.user_id = me AND ir.actor_id = p_actor;

  IF existing_decision = 'match' THEN
    RAISE EXCEPTION 'decision_locked_match';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.flashes
    WHERE from_user = p_actor AND to_user = me
  ) INTO has_flash;

  SELECT EXISTS (
    SELECT 1 FROM public.likes
    WHERE from_user = p_actor AND to_user = me
  ) INTO has_like;

  IF existing_origin IN ('flash', 'like') THEN
    v_origin := existing_origin;
  ELSIF v_origin NOT IN ('flash', 'like') THEN
    v_origin := CASE WHEN has_flash THEN 'flash' ELSE 'like' END;
  END IF;

  INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
  VALUES (me, p_actor, 'wait', v_origin)
  ON CONFLICT (user_id, actor_id) DO UPDATE
  SET
    decision = 'wait',
    origin = EXCLUDED.origin,
    updated_at = now(),
    wait_started_at = now(),
    wait_expiry_notified_at = NULL
  WHERE public.inbox_responses.decision IS DISTINCT FROM 'match';

  RETURN jsonb_build_object(
    'ok', true,
    'decision', 'wait',
    'origin', v_origin
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_inbox_interest(p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  existing_decision text;
  existing_origin text;
  actor_name text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_actor IS NULL OR p_actor = me THEN
    RAISE EXCEPTION 'invalid_actor';
  END IF;

  SELECT ir.decision, ir.origin
  INTO existing_decision, existing_origin
  FROM public.inbox_responses ir
  WHERE ir.user_id = me AND ir.actor_id = p_actor;

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
  WHERE user_id = me
    AND actor_id = p_actor
    AND decision = 'wait';

  DELETE FROM public.social_notifications
  WHERE user_id = me
    AND actor_id = p_actor
    AND kind IN ('match_wait_reminder', 'match_wait_expiry');

  DELETE FROM public.social_notifications
  WHERE user_id = p_actor
    AND actor_id = me
    AND kind IN ('match_waiting', 'match_wait_reminder')
    AND read_at IS NULL;

  IF existing_origin IN ('flash', 'like') THEN
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
        CASE WHEN existing_origin = 'flash' THEN 'flash_received' ELSE 'like_received' END,
        CASE WHEN existing_origin = 'flash' THEN 'Nouveau Flash' ELSE 'Nouveau like' END,
        actor_name || CASE
          WHEN existing_origin = 'flash' THEN ' t''a envoyé un flash'
          ELSE ' t''a envoyé un like'
        END,
        p_actor
      );
    END IF;
  END IF;

  PERFORM public.prune_inbox_wait_expiry_digest(me);

  RETURN jsonb_build_object('ok', true, 'decision', 'reset', 'origin', existing_origin);
END;
$$;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron non disponible : %', SQLERRM;
  END;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'Fallback : exécuter public.process_inbox_wait_expirations() depuis le SQL Editor.';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule(j.jobid)
    FROM cron.job j
    WHERE j.jobname = 'expire-inbox-waits';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    PERFORM cron.schedule(
      'expire-inbox-waits',
      '30 3 * * *',
      'SELECT public.process_inbox_wait_expirations()'
    );
    RAISE NOTICE 'pg_cron : job expire-inbox-waits planifié (03:30 UTC).';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Impossible de planifier pg_cron expire-inbox-waits : %', SQLERRM;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
