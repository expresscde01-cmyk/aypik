-- Couronne : match_bonds orphelin + like entrant seulement → écrit like renvoyé
-- et inbox_responses.decision=match, avec matched_at.
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
    'crown-persist-test', now(),
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
  v_me uuid := gen_random_uuid();
  v_luck uuid := gen_random_uuid();
  v_out jsonb;
  v_like integer;
  v_decision text;
  v_matched_at timestamptz;
  v_already_matched boolean;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  SELECT instance_id INTO v_instance FROM auth.users LIMIT 1;
  v_instance := COALESCE(v_instance, '00000000-0000-0000-0000-000000000000');

  PERFORM pg_temp.ins_auth(v_me, 'crown-me-' || v_me::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_luck, 'crown-luck-' || v_luck::text || '@aypik.test', v_instance);

  INSERT INTO public.profiles (id, display_name, birth_date) VALUES
    (v_me, 'Alex', DATE '1990-01-01'),
    (v_luck, 'Luck', DATE '1992-06-15');

  INSERT INTO public.likes (from_user, to_user, created_at)
  VALUES (v_luck, v_me, timestamptz '2026-08-19 10:00:00+00');

  INSERT INTO public.match_bonds (user_a, user_b, origin)
  VALUES (LEAST(v_me, v_luck), GREATEST(v_me, v_luck), 'like');

  v_already_matched := public.users_are_matched(v_me, v_luck);
  IF NOT v_already_matched THEN
    RAISE EXCEPTION 'test setup: expected users_are_matched via match_bonds';
  END IF;

  PERFORM pg_temp.set_auth(v_me);
  v_out := public.respond_to_inbox_interest(v_luck, 'match', 'like');

  IF COALESCE(v_out->>'ok', '') <> 'true' OR v_out->>'decision' <> 'match' THEN
    RAISE EXCEPTION 'crown rpc failed: %', v_out;
  END IF;
  IF v_out ? 'matched_at' AND v_out->>'matched_at' IS NULL THEN
    RAISE EXCEPTION 'matched_at missing: %', v_out;
  END IF;

  SELECT count(*)::integer INTO v_like
  FROM public.likes
  WHERE from_user = v_me AND to_user = v_luck;
  IF v_like <> 1 THEN
    RAISE EXCEPTION 'expected outgoing like after crown, got %', v_like;
  END IF;

  SELECT ir.decision, ir.updated_at
  INTO v_decision, v_matched_at
  FROM public.inbox_responses ir
  WHERE ir.user_id = v_me AND ir.actor_id = v_luck;

  IF v_decision IS DISTINCT FROM 'match' THEN
    RAISE EXCEPTION 'expected inbox decision match, got %', v_decision;
  END IF;
  IF v_matched_at IS NULL THEN
    RAISE EXCEPTION 'expected inbox updated_at (match date)';
  END IF;
  IF v_matched_at < timestamptz '2026-08-19 10:00:00+00' THEN
    RAISE EXCEPTION 'match date older than incoming like: %', v_matched_at;
  END IF;
END;
$$;

ROLLBACK;
