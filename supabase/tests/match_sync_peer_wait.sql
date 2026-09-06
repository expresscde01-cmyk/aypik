-- Fernand/Alexandra : A attend, B matche → les deux lignes inbox passent
-- à match ; wait_started_at conservé ; plus aucune notif d’attente non lue.
-- Sens inverse ensuite. Pas de ligne fantôme si l’autre n’avait pas wait.
-- Exécuter d’un coup (ROLLBACK).

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ins_auth(
  p_id uuid,
  p_email text,
  p_instance uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    p_instance, p_id, 'authenticated', 'authenticated', p_email,
    'match-sync-test', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, now(), now(), '', '', '', ''
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_auth(p_id uuid) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text,
    true
  );
END;
$$;

DO $$
DECLARE
  v_instance uuid;
  v_alex uuid := gen_random_uuid();
  v_fern uuid := gen_random_uuid();
  v_a2 uuid := gen_random_uuid();
  v_b2 uuid := gen_random_uuid();
  v_a3 uuid := gen_random_uuid();
  v_b3 uuid := gen_random_uuid();
  v_wait_at timestamptz;
  v_wait_at_after timestamptz;
  v_dec_alex text;
  v_dec_fern text;
  v_unread integer;
  v_alex_rows integer;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  SELECT instance_id INTO v_instance FROM auth.users LIMIT 1;
  v_instance := COALESCE(v_instance, '00000000-0000-0000-0000-000000000000');

  PERFORM pg_temp.ins_auth(v_alex, 'sync-alex-' || v_alex::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_fern, 'sync-fern-' || v_fern::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_a2, 'sync-a2-' || v_a2::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_b2, 'sync-b2-' || v_b2::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_a3, 'sync-a3-' || v_a3::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_b3, 'sync-b3-' || v_b3::text || '@aypik.test', v_instance);

  INSERT INTO public.profiles (id, display_name, birth_date) VALUES
    (v_alex, 'Alexandra', DATE '1990-01-01'),
    (v_fern, 'Fernand', DATE '1990-01-01'),
    (v_a2, 'A2', DATE '1990-01-01'),
    (v_b2, 'B2', DATE '1990-01-01'),
    (v_a3, 'A3', DATE '1990-01-01'),
    (v_b3, 'B3', DATE '1990-01-01');

  -- Cas 1 : likes croisés, Alexandra attend, Fernand matche.
  INSERT INTO public.likes (from_user, to_user) VALUES (v_alex, v_fern);
  INSERT INTO public.likes (from_user, to_user) VALUES (v_fern, v_alex)
  ON CONFLICT (from_user, to_user) DO NOTHING;

  PERFORM pg_temp.set_auth(v_alex);
  PERFORM public.respond_to_inbox_interest(v_fern, 'wait', 'like');

  SELECT wait_started_at, decision INTO v_wait_at, v_dec_alex
  FROM public.inbox_responses
  WHERE user_id = v_alex AND actor_id = v_fern;

  IF v_dec_alex IS DISTINCT FROM 'wait' OR v_wait_at IS NULL THEN
    RAISE EXCEPTION 'cas1_wait_not_set decision=% clock=%', v_dec_alex, v_wait_at;
  END IF;

  PERFORM pg_temp.set_auth(v_fern);
  PERFORM public.respond_to_inbox_interest(v_alex, 'match', 'like');

  SELECT decision, wait_started_at INTO v_dec_alex, v_wait_at_after
  FROM public.inbox_responses
  WHERE user_id = v_alex AND actor_id = v_fern;

  SELECT decision INTO v_dec_fern
  FROM public.inbox_responses
  WHERE user_id = v_fern AND actor_id = v_alex;

  IF v_dec_alex IS DISTINCT FROM 'match' OR v_dec_fern IS DISTINCT FROM 'match' THEN
    RAISE EXCEPTION 'cas1_not_both_match alex=% fern=%', v_dec_alex, v_dec_fern;
  END IF;

  IF v_wait_at_after IS DISTINCT FROM v_wait_at THEN
    RAISE EXCEPTION 'cas1_wait_clock_reset % → %', v_wait_at, v_wait_at_after;
  END IF;

  SELECT count(*) INTO v_unread
  FROM public.social_notifications
  WHERE kind IN ('match_waiting', 'match_wait_reminder')
    AND read_at IS NULL
    AND (
      (user_id = v_alex AND actor_id = v_fern)
      OR (user_id = v_fern AND actor_id = v_alex)
    );

  IF v_unread <> 0 THEN
    RAISE EXCEPTION 'cas1_unread_wait_notifs=%', v_unread;
  END IF;

  -- Cas 2 : sens inverse (B attend, A matche).
  INSERT INTO public.likes (from_user, to_user) VALUES (v_a2, v_b2);
  INSERT INTO public.likes (from_user, to_user) VALUES (v_b2, v_a2)
  ON CONFLICT (from_user, to_user) DO NOTHING;

  PERFORM pg_temp.set_auth(v_b2);
  PERFORM public.respond_to_inbox_interest(v_a2, 'wait', 'like');

  SELECT wait_started_at INTO v_wait_at
  FROM public.inbox_responses
  WHERE user_id = v_b2 AND actor_id = v_a2;

  PERFORM pg_temp.set_auth(v_a2);
  PERFORM public.respond_to_inbox_interest(v_b2, 'match', 'like');

  SELECT ir_a.decision, ir_b.decision, ir_b.wait_started_at
  INTO v_dec_alex, v_dec_fern, v_wait_at_after
  FROM public.inbox_responses ir_a
  JOIN public.inbox_responses ir_b
    ON ir_b.user_id = v_b2 AND ir_b.actor_id = v_a2
  WHERE ir_a.user_id = v_a2 AND ir_a.actor_id = v_b2;

  IF v_dec_alex IS DISTINCT FROM 'match' OR v_dec_fern IS DISTINCT FROM 'match' THEN
    RAISE EXCEPTION 'cas2_not_both_match a=% b=%', v_dec_alex, v_dec_fern;
  END IF;

  IF v_wait_at_after IS DISTINCT FROM v_wait_at THEN
    RAISE EXCEPTION 'cas2_wait_clock_reset % → %', v_wait_at, v_wait_at_after;
  END IF;

  SELECT count(*) INTO v_unread
  FROM public.social_notifications
  WHERE kind IN ('match_waiting', 'match_wait_reminder')
    AND read_at IS NULL
    AND (
      (user_id = v_a2 AND actor_id = v_b2)
      OR (user_id = v_b2 AND actor_id = v_a2)
    );

  IF v_unread <> 0 THEN
    RAISE EXCEPTION 'cas2_unread_wait_notifs=%', v_unread;
  END IF;

  -- Cas 3 : A n’a pas de ligne — B attend puis matche, pas de ligne fantôme chez A.
  INSERT INTO public.likes (from_user, to_user) VALUES (v_a3, v_b3);

  PERFORM pg_temp.set_auth(v_b3);
  PERFORM public.respond_to_inbox_interest(v_a3, 'wait', 'like');
  PERFORM public.respond_to_inbox_interest(v_a3, 'match', 'like');

  SELECT count(*) INTO v_alex_rows
  FROM public.inbox_responses
  WHERE user_id = v_a3 AND actor_id = v_b3;

  IF v_alex_rows <> 0 THEN
    RAISE EXCEPTION 'cas3_phantom_peer_row count=%', v_alex_rows;
  END IF;

  SELECT decision INTO v_dec_fern
  FROM public.inbox_responses
  WHERE user_id = v_b3 AND actor_id = v_a3;

  IF v_dec_fern IS DISTINCT FROM 'match' THEN
    RAISE EXCEPTION 'cas3_matcher_not_match decision=%', v_dec_fern;
  END IF;

  RAISE NOTICE 'match_sync_peer_wait_ok';
END
$$;

ROLLBACK;
