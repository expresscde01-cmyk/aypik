-- Test rejouable : une attente restée « wait » (archivage local, decision
-- inchangée) expire toujours à 3 mois ; le rappel J-7 part toujours.
-- Exécuter le fichier entier d’un coup. Rien n’est persisté (ROLLBACK).
-- Si une assertion échoue : exécuter ROLLBACK puis relire le message.

BEGIN;

DO $$
DECLARE
  v_instance uuid;
  v_a uuid := gen_random_uuid();
  v_b_expire uuid := gen_random_uuid();
  v_b_warn uuid := gen_random_uuid();
  v_started_expire timestamptz;
  v_started_after timestamptz;
  v_decision text;
  v_declined integer;
  v_digest integer;
  v_notified timestamptz;
  v_job jsonb;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  SELECT instance_id INTO v_instance FROM auth.users LIMIT 1;
  v_instance := COALESCE(v_instance, '00000000-0000-0000-0000-000000000000');

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  )
  VALUES
    (
      v_instance, v_a, 'authenticated', 'authenticated',
      'wait-exp-a-' || v_a::text || '@aypik.test',
      'wait-exp-test',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      v_instance, v_b_expire, 'authenticated', 'authenticated',
      'wait-exp-b-' || v_b_expire::text || '@aypik.test',
      'wait-exp-test',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      v_instance, v_b_warn, 'authenticated', 'authenticated',
      'wait-exp-w-' || v_b_warn::text || '@aypik.test',
      'wait-exp-test',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', ''
    );

  INSERT INTO public.profiles (id, display_name, birth_date)
  VALUES
    (v_a, 'Attente A', DATE '1990-01-01'),
    (v_b_expire, 'Attente B expire', DATE '1990-01-01'),
    (v_b_warn, 'Attente B j7', DATE '1990-01-01');

  -- Cas 1 : mis en attente il y a 3 mois, decision reste wait
  -- (l’archivage local ne change pas la ligne serveur).
  INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
  VALUES (v_a, v_b_expire, 'wait', 'like');

  UPDATE public.inbox_responses
  SET
    wait_started_at = now() - interval '3 months',
    wait_expiry_notified_at = NULL
  WHERE user_id = v_a AND actor_id = v_b_expire;

  SELECT wait_started_at INTO v_started_expire
  FROM public.inbox_responses
  WHERE user_id = v_a AND actor_id = v_b_expire;

  PERFORM set_config('request.jwt.claim.sub', v_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.restore_inbox_wait(v_b_expire, 'like');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%not_authenticated%' THEN
      RAISE;
    END IF;
    INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
    VALUES (v_a, v_b_expire, 'wait', 'like')
    ON CONFLICT (user_id, actor_id) DO UPDATE
    SET
      decision = 'wait',
      origin = EXCLUDED.origin,
      updated_at = now(),
      wait_started_at = CASE
        WHEN public.inbox_responses.decision = 'wait'
          THEN COALESCE(public.inbox_responses.wait_started_at, now())
        ELSE now()
      END,
      wait_expiry_notified_at = CASE
        WHEN public.inbox_responses.decision = 'wait'
          THEN public.inbox_responses.wait_expiry_notified_at
        ELSE NULL
      END
    WHERE public.inbox_responses.decision IS DISTINCT FROM 'match';
  END;

  SELECT wait_started_at INTO v_started_after
  FROM public.inbox_responses
  WHERE user_id = v_a AND actor_id = v_b_expire;

  IF v_started_after IS DISTINCT FROM v_started_expire THEN
    RAISE EXCEPTION 'restore_wait_reset_clock: % → %', v_started_expire, v_started_after;
  END IF;

  -- Cas 2 : J-7 (encore dans les 3 mois, déjà dans la fenêtre d’alerte).
  INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
  VALUES (v_a, v_b_warn, 'wait', 'like');

  UPDATE public.inbox_responses
  SET
    wait_started_at = now() - interval '3 months' + interval '3 days',
    wait_expiry_notified_at = NULL
  WHERE user_id = v_a AND actor_id = v_b_warn;

  v_job := public.process_inbox_wait_expirations();

  SELECT ir.decision INTO v_decision
  FROM public.inbox_responses ir
  WHERE ir.user_id = v_a AND ir.actor_id = v_b_expire;

  IF v_decision IS DISTINCT FROM 'refuse' THEN
    RAISE EXCEPTION 'archived_wait_did_not_expire: decision=% job=%', v_decision, v_job;
  END IF;

  SELECT count(*) INTO v_declined
  FROM public.social_notifications
  WHERE user_id = v_b_expire
    AND actor_id = v_a
    AND kind = 'match_declined';

  IF v_declined < 1 THEN
    RAISE EXCEPTION 'expire_missing_match_declined job=%', v_job;
  END IF;

  SELECT ir.decision, ir.wait_expiry_notified_at
  INTO v_decision, v_notified
  FROM public.inbox_responses ir
  WHERE ir.user_id = v_a AND ir.actor_id = v_b_warn;

  IF v_decision IS DISTINCT FROM 'wait' THEN
    RAISE EXCEPTION 'j7_wait_was_expired: decision=% job=%', v_decision, v_job;
  END IF;

  IF v_notified IS NULL THEN
    RAISE EXCEPTION 'j7_wait_not_marked_notified job=%', v_job;
  END IF;

  SELECT count(*) INTO v_digest
  FROM public.social_notifications
  WHERE user_id = v_a
    AND kind = 'match_wait_expiry'
    AND actor_id IS NULL;

  IF v_digest < 1 THEN
    RAISE EXCEPTION 'j7_digest_missing job=%', v_job;
  END IF;

  RAISE NOTICE 'inbox_wait_expiration_ok %', v_job;
END
$$;

ROLLBACK;
