-- Refus : like/flash entrant disparu ; relike du refuseur = cycle like_received.
-- Wait sur paire déjà matchée : already:true, aucune ligne wait.
-- Second Run, APRÈS COLLER-REFUSE-CLEAR-INTEREST.sql (ne pas fusionner).

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
    'refuse-interest-test', now(),
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
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_c uuid := gen_random_uuid();
  v_d uuid := gen_random_uuid();
  v_e uuid := gen_random_uuid();
  v_f uuid := gen_random_uuid();
  v_out jsonb;
  v_n integer;
  v_dec text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  SELECT instance_id INTO v_instance FROM auth.users LIMIT 1;
  v_instance := COALESCE(v_instance, '00000000-0000-0000-0000-000000000000');

  PERFORM pg_temp.ins_auth(v_a, 'ref-a-' || v_a::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_b, 'ref-b-' || v_b::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_c, 'ref-c-' || v_c::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_d, 'ref-d-' || v_d::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_e, 'ref-e-' || v_e::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_f, 'ref-f-' || v_f::text || '@aypik.test', v_instance);

  INSERT INTO public.profiles (id, display_name, birth_date) VALUES
    (v_a, 'Refuse A', DATE '1990-01-01'),
    (v_b, 'Actor B', DATE '1990-01-01'),
    (v_c, 'Refuse C', DATE '1990-01-01'),
    (v_d, 'Actor D', DATE '1990-01-01'),
    (v_e, 'Match E', DATE '1990-01-01'),
    (v_f, 'Match F', DATE '1990-01-01');

  -- (a1) B like A, A refuse → like B→A disparu ; like A→B ensuite ≠ match.
  INSERT INTO public.likes (from_user, to_user) VALUES (v_b, v_a);

  PERFORM pg_temp.set_auth(v_a);
  v_out := public.respond_to_inbox_interest(v_b, 'refuse', 'like');
  IF COALESCE(v_out->>'ok', '') IS DISTINCT FROM 'true'
     OR v_out->>'decision' IS DISTINCT FROM 'refuse' THEN
    RAISE EXCEPTION 'a1_refuse_failed %', v_out;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.likes
  WHERE from_user = v_b AND to_user = v_a;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'a1_incoming_like_remain count=%', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.likes
  WHERE from_user = v_a AND to_user = v_b;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'a1_unexpected_outbound_like count=%', v_n;
  END IF;

  SELECT decision INTO v_dec
  FROM public.inbox_responses
  WHERE user_id = v_a AND actor_id = v_b;
  IF v_dec IS DISTINCT FROM 'refuse' THEN
    RAISE EXCEPTION 'a1_decision=%', v_dec;
  END IF;

  INSERT INTO public.likes (from_user, to_user) VALUES (v_a, v_b);

  IF public.users_are_matched(v_a, v_b) THEN
    RAISE EXCEPTION 'a1_instant_match_after_relike';
  END IF;

  SELECT count(*) INTO v_n
  FROM public.match_bonds
  WHERE user_a = LEAST(v_a, v_b) AND user_b = GREATEST(v_a, v_b);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'a1_bond_created count=%', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.social_notifications
  WHERE user_id = v_b AND actor_id = v_a AND kind = 'like_received';
  IF v_n < 1 THEN
    RAISE EXCEPTION 'a1_missing_like_received count=%', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.social_notifications
  WHERE kind = 'match_created'
    AND (
      (user_id = v_a AND actor_id = v_b)
      OR (user_id = v_b AND actor_id = v_a)
    );
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'a1_match_created_notif count=%', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.likes
  WHERE from_user = v_a AND to_user = v_b;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'a1_refuser_like_dropped count=%', v_n;
  END IF;

  -- (a2) D flash C, C refuse → flash disparu ; like C→D ≠ match.
  INSERT INTO public.flashes (from_user, to_user) VALUES (v_d, v_c);

  PERFORM pg_temp.set_auth(v_c);
  v_out := public.respond_to_inbox_interest(v_d, 'refuse', 'flash');
  IF v_out->>'decision' IS DISTINCT FROM 'refuse' THEN
    RAISE EXCEPTION 'a2_refuse_failed %', v_out;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.flashes
  WHERE from_user = v_d AND to_user = v_c;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'a2_incoming_flash_remain count=%', v_n;
  END IF;

  INSERT INTO public.likes (from_user, to_user) VALUES (v_c, v_d);

  IF public.users_are_matched(v_c, v_d) THEN
    RAISE EXCEPTION 'a2_instant_match_after_relike';
  END IF;

  SELECT count(*) INTO v_n
  FROM public.social_notifications
  WHERE user_id = v_d AND actor_id = v_c AND kind = 'like_received';
  IF v_n < 1 THEN
    RAISE EXCEPTION 'a2_missing_like_received count=%', v_n;
  END IF;

  -- (b) Paire déjà matchée : wait no-op, pas de ligne wait.
  INSERT INTO public.likes (from_user, to_user) VALUES (v_e, v_f), (v_f, v_e)
  ON CONFLICT (from_user, to_user) DO NOTHING;
  INSERT INTO public.match_bonds (user_a, user_b, origin)
  VALUES (LEAST(v_e, v_f), GREATEST(v_e, v_f), 'like')
  ON CONFLICT (user_a, user_b) DO NOTHING;

  IF NOT public.users_are_matched(v_e, v_f) THEN
    RAISE EXCEPTION 'b_fixture_not_matched';
  END IF;

  PERFORM pg_temp.set_auth(v_e);
  v_out := public.respond_to_inbox_interest(v_f, 'wait', 'like');
  IF COALESCE(v_out->>'ok', '') IS DISTINCT FROM 'true'
     OR v_out->>'decision' IS DISTINCT FROM 'match'
     OR COALESCE(v_out->>'already', '') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'b_wait_not_already %', v_out;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.inbox_responses
  WHERE user_id = v_e AND actor_id = v_f;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'b_wait_row_created count=%', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.inbox_responses
  WHERE (user_id = v_e AND actor_id = v_f AND decision = 'wait')
     OR (user_id = v_f AND actor_id = v_e AND decision = 'wait');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'b_wait_row_any_side count=%', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.likes
  WHERE (from_user = v_e AND to_user = v_f)
     OR (from_user = v_f AND to_user = v_e);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'b_likes_changed count=%', v_n;
  END IF;

  -- Wait inchangé s’il existait déjà.
  INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
  VALUES (v_e, v_f, 'wait', 'like');

  PERFORM pg_temp.set_auth(v_e);
  v_out := public.respond_to_inbox_interest(v_f, 'wait', 'like');
  IF COALESCE(v_out->>'already', '') IS DISTINCT FROM 'true'
     OR v_out->>'decision' IS DISTINCT FROM 'match' THEN
    RAISE EXCEPTION 'b2_wait_existing_not_already %', v_out;
  END IF;

  SELECT decision INTO v_dec
  FROM public.inbox_responses
  WHERE user_id = v_e AND actor_id = v_f;
  IF v_dec IS DISTINCT FROM 'wait' THEN
    RAISE EXCEPTION 'b2_wait_row_mutated decision=%', v_dec;
  END IF;

  RAISE NOTICE 'refuse_clears_incoming_ok';
END
$$;

ROLLBACK;
