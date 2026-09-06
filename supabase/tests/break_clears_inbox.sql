-- Rompre un match — test bout-en-bout du RPC réel (comme « Rompre un match »).
-- Second Run, APRÈS COLLER-BREAK-CLEAR-INBOX.sql (ne pas fusionner).
-- Le ROLLBACK n’annule que les comptes de test, pas les fonctions du premier Run.
--
-- Vérifie : manage_active_match ok/break, deux lignes match_breaks(action='break')
-- avec initiated_by = l’auteur, users_are_matched = false, likes/bond absents,
-- inbox_responses absentes, relike sans decision_locked_match, archive intacte.

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
    'break-inbox-test', now(),
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
  v_out jsonb;
  v_n integer;
  v_dec text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF to_regprocedure('public.upsert_match_break(uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'missing_upsert_4param';
  END IF;
  IF to_regprocedure('public.upsert_match_break(uuid,uuid,text,text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'stale_upsert_5param';
  END IF;

  SELECT instance_id INTO v_instance FROM auth.users LIMIT 1;
  v_instance := COALESCE(v_instance, '00000000-0000-0000-0000-000000000000');

  PERFORM pg_temp.ins_auth(v_a, 'brk-a-' || v_a::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_b, 'brk-b-' || v_b::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_c, 'brk-c-' || v_c::text || '@aypik.test', v_instance);
  PERFORM pg_temp.ins_auth(v_d, 'brk-d-' || v_d::text || '@aypik.test', v_instance);

  INSERT INTO public.profiles (id, display_name, birth_date) VALUES
    (v_a, 'Break A', DATE '1990-01-01'),
    (v_b, 'Break B', DATE '1990-01-01'),
    (v_c, 'Archive C', DATE '1990-01-01'),
    (v_d, 'Archive D', DATE '1990-01-01');

  -- (a) Match réel puis Rompre (même RPC que le bouton).
  INSERT INTO public.likes (from_user, to_user) VALUES (v_a, v_b), (v_b, v_a)
  ON CONFLICT (from_user, to_user) DO NOTHING;
  INSERT INTO public.match_bonds (user_a, user_b, origin)
  VALUES (LEAST(v_a, v_b), GREATEST(v_a, v_b), 'like')
  ON CONFLICT (user_a, user_b) DO NOTHING;

  INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
  VALUES (v_a, v_b, 'match', 'like'), (v_b, v_a, 'match', 'like')
  ON CONFLICT (user_id, actor_id) DO UPDATE SET decision = 'match';

  IF NOT public.users_are_matched(v_a, v_b) THEN
    RAISE EXCEPTION 'a_fixture_not_matched';
  END IF;

  PERFORM pg_temp.set_auth(v_a);
  v_out := public.manage_active_match(v_b, true);
  IF COALESCE(v_out->>'ok', '') IS DISTINCT FROM 'true'
     OR v_out->>'action' IS DISTINCT FROM 'break' THEN
    RAISE EXCEPTION 'a_break_failed %', v_out;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.match_breaks
  WHERE action = 'break'
    AND (
      (user_id = v_a AND peer_id = v_b)
      OR (user_id = v_b AND peer_id = v_a)
    );
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'a_break_rows_count=% (attendu 2)', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.match_breaks
  WHERE action = 'break'
    AND initiated_by = v_a
    AND (
      (user_id = v_a AND peer_id = v_b)
      OR (user_id = v_b AND peer_id = v_a)
    );
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'a_initiated_by_count=% (attendu 2, auteur=A)', v_n;
  END IF;

  IF public.users_are_matched(v_a, v_b) THEN
    RAISE EXCEPTION 'a_still_matched_after_break';
  END IF;

  SELECT count(*) INTO v_n
  FROM public.likes
  WHERE (from_user = v_a AND to_user = v_b)
     OR (from_user = v_b AND to_user = v_a);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'a_likes_remain count=%', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.match_bonds
  WHERE user_a = LEAST(v_a, v_b)
    AND user_b = GREATEST(v_a, v_b);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'a_bond_remain count=%', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.inbox_responses
  WHERE (user_id = v_a AND actor_id = v_b)
     OR (user_id = v_b AND actor_id = v_a);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'a_inbox_not_cleared count=%', v_n;
  END IF;

  -- (b) Relike après rupture : wait puis match, sans decision_locked_match.
  INSERT INTO public.likes (from_user, to_user) VALUES (v_a, v_b)
  ON CONFLICT (from_user, to_user) DO NOTHING;

  PERFORM pg_temp.set_auth(v_b);
  BEGIN
    v_out := public.respond_to_inbox_interest(v_a, 'wait', 'like');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'b_wait_locked: %', SQLERRM;
  END;
  IF v_out->>'decision' IS DISTINCT FROM 'wait' THEN
    RAISE EXCEPTION 'b_wait_failed %', v_out;
  END IF;

  BEGIN
    v_out := public.respond_to_inbox_interest(v_a, 'match', 'like');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'b_match_locked: %', SQLERRM;
  END;
  IF v_out->>'decision' IS DISTINCT FROM 'match' THEN
    RAISE EXCEPTION 'b_match_failed %', v_out;
  END IF;

  -- (c) Archive : inbox inchangée, une seule ligne match_breaks (soi).
  INSERT INTO public.likes (from_user, to_user) VALUES (v_c, v_d), (v_d, v_c)
  ON CONFLICT (from_user, to_user) DO NOTHING;
  INSERT INTO public.match_bonds (user_a, user_b, origin)
  VALUES (LEAST(v_c, v_d), GREATEST(v_c, v_d), 'like')
  ON CONFLICT (user_a, user_b) DO NOTHING;
  INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
  VALUES (v_c, v_d, 'match', 'like'), (v_d, v_c, 'wait', 'like')
  ON CONFLICT (user_id, actor_id) DO UPDATE
  SET decision = EXCLUDED.decision;

  PERFORM pg_temp.set_auth(v_c);
  v_out := public.manage_active_match(v_d, false);
  IF v_out->>'action' IS DISTINCT FROM 'archive' THEN
    RAISE EXCEPTION 'c_archive_failed %', v_out;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.match_breaks
  WHERE user_id = v_c AND peer_id = v_d AND action = 'archive';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'c_archive_row_missing count=%', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.match_breaks
  WHERE user_id = v_d AND peer_id = v_c;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'c_archive_wrote_peer_row count=%', v_n;
  END IF;

  IF NOT public.users_are_matched(v_c, v_d) THEN
    RAISE EXCEPTION 'c_archive_broke_match';
  END IF;

  SELECT decision INTO v_dec
  FROM public.inbox_responses
  WHERE user_id = v_c AND actor_id = v_d;
  IF v_dec IS DISTINCT FROM 'match' THEN
    RAISE EXCEPTION 'c_archive_changed_c decision=%', v_dec;
  END IF;

  SELECT decision INTO v_dec
  FROM public.inbox_responses
  WHERE user_id = v_d AND actor_id = v_c;
  IF v_dec IS DISTINCT FROM 'wait' THEN
    RAISE EXCEPTION 'c_archive_changed_d decision=%', v_dec;
  END IF;

  RAISE NOTICE 'break_match_e2e_ok';
END
$$;

ROLLBACK;
