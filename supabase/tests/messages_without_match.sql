-- Messages sans Match.
-- Le RAISE annule la transaction : rien n'est conserve.
-- Tant que 20261108103000 n'est pas appliquee, lancer ce bloc juste apres elle, dans le meme BEGIN.

BEGIN;

DO $$
DECLARE
  v_instance uuid;
  v_paid uuid := gen_random_uuid();
  v_free uuid := gen_random_uuid();
  v_closed uuid := gen_random_uuid();
  v_open uuid := gen_random_uuid();
  v_reply uuid := gen_random_uuid();
  v_paused uuid := gen_random_uuid();
  v_deleted uuid := gen_random_uuid();
  v_refused uuid := gen_random_uuid();
  v_passed uuid := gen_random_uuid();
  v_post uuid := gen_random_uuid();
  v_peer uuid := gen_random_uuid();
  v_born uuid := gen_random_uuid();
  v_notice boolean;
  v_kept boolean;
  v_extra uuid;
  v_i integer;
  v_err text;
  v_code text;
  v_n integer;
  v_out jsonb := '{}'::jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM set_config('row_security', 'off', true);
  PERFORM set_config('aypik.allow_deletion_ts', '1', true);

  SELECT instance_id INTO v_instance FROM auth.users LIMIT 1;
  v_instance := COALESCE(v_instance, '00000000-0000-0000-0000-000000000000');

  v_ids := ARRAY[v_paid, v_free, v_closed, v_open, v_reply, v_paused, v_deleted, v_refused, v_passed, v_post, v_peer, v_born];
  FOR v_i IN 1..11 LOOP
    v_extra := gen_random_uuid();
    v_ids := v_ids || v_extra;
  END LOOP;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  SELECT
    v_instance, uid, 'authenticated', 'authenticated',
    'msg-gate-' || uid::text || '@aypik.test',
    'msg-gate-test', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, now(), now(), '', '', '', ''
  FROM unnest(v_ids) AS uid;

  INSERT INTO public.memberships (user_id, plan, premium_until, created_at)
  VALUES (v_paid, 'basique', now() + interval '30 days', now() - interval '40 days');

  INSERT INTO public.memberships (user_id, plan, created_at)
  VALUES
    (v_free, 'free', now()),
    (v_post, 'free', now() - interval '40 days'),
    (v_born, 'free', now() - interval '40 days');

  INSERT INTO public.profiles (id, display_name, birth_date, accepts_messages_without_match)
  SELECT uid, 'M', DATE '1990-01-01', false
  FROM unnest(v_ids) AS uid;

  UPDATE public.profiles SET accepts_messages_without_match = true
  WHERE id IN (v_open, v_reply, v_paused, v_deleted, v_refused, v_passed, v_post, v_peer);

  UPDATE public.profiles SET paused_at = now() WHERE id = v_paused;
  UPDATE public.profiles SET deletion_requested_at = now() WHERE id = v_deleted;

  UPDATE public.profiles
  SET discover_mode = 'simplifie'
  WHERE id = v_closed;
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_closed AND accepts_messages_without_match
  ) THEN
    RAISE EXCEPTION 'discover_mode_flipped_the_flag';
  END IF;

  UPDATE public.profiles
  SET discover_mode = 'detaille', accepts_messages_without_match = true
  WHERE id = v_open;
  UPDATE public.profiles SET discover_mode = 'simplifie' WHERE id = v_open;
  SELECT accepts_messages_without_match INTO v_kept
  FROM public.profiles WHERE id = v_open;
  IF NOT v_kept THEN
    RAISE EXCEPTION 'simplifie_cleared_accept';
  END IF;
  UPDATE public.profiles
  SET discover_mode = 'detaille', accepts_messages_without_match = false
  WHERE id = v_closed;
  UPDATE public.profiles SET discover_mode = 'simplifie' WHERE id = v_closed;
  SELECT accepts_messages_without_match INTO v_kept
  FROM public.profiles WHERE id = v_closed;
  v_out := v_out || jsonb_build_object('mode_switch', CASE WHEN NOT v_kept THEN 'kept' ELSE 'flipped' END);

  PERFORM set_config('request.jwt.claim.sub', v_paid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_paid, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.insert_chat_message(v_closed, 'ferme');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  v_out := v_out || jsonb_build_object('closed',
    CASE WHEN v_err ILIKE '%recipient_declines_messages_without_match%' THEN 'declines' ELSE 'other' END);

  BEGIN
    PERFORM public.insert_chat_message(v_open, 'ouvert');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  v_out := v_out || jsonb_build_object('basique',
    CASE WHEN v_err = 'ok' THEN 'ok' ELSE 'other' END);

  BEGIN
    PERFORM public.insert_chat_message(v_open, 'suite');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  SELECT n INTO v_n FROM public.message_openers_daily WHERE user_id = v_paid;
  v_out := v_out || jsonb_build_object('followup',
    CASE WHEN v_err = 'ok' AND v_n = 1 THEN 'ok' ELSE 'other' END);

  UPDATE public.profiles SET accepts_messages_without_match = false WHERE id = v_open;
  BEGIN
    PERFORM public.insert_chat_message(v_open, 'encore');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  v_out := v_out || jsonb_build_object('thread_stays',
    CASE WHEN v_err = 'ok' THEN 'ok' ELSE 'other' END);

  PERFORM set_config('request.jwt.claim.sub', v_free::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.insert_chat_message(v_reply, 'gratuit');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  v_out := v_out || jsonb_build_object('free_open',
    CASE WHEN v_err ILIKE '%sender_plan_required%' THEN 'plan' ELSE 'other' END);

  PERFORM set_config('request.jwt.claim.sub', v_paid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_paid, 'role', 'authenticated')::text, true);
  PERFORM public.insert_chat_message(v_post, 'bonjour');

  PERFORM set_config('request.jwt.claim.sub', v_post::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_post, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.insert_chat_message(v_paid, 'reponse');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  SELECT n INTO v_n FROM public.message_openers_daily WHERE user_id = v_post;
  v_out := v_out || jsonb_build_object('free_reply',
    CASE WHEN v_err = 'ok' AND v_n IS NULL THEN 'ok' ELSE 'other' END);

  PERFORM set_config('request.jwt.claim.sub', v_paid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_paid, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.insert_chat_message(v_paused, 'pause');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  v_out := v_out || jsonb_build_object('paused',
    CASE WHEN v_err ILIKE '%member_unavailable%' THEN 'unavailable' ELSE 'other' END);

  BEGIN
    PERFORM public.insert_chat_message(v_deleted, 'suppr');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  v_out := v_out || jsonb_build_object('deletion',
    CASE WHEN v_err ILIKE '%member_unavailable%' THEN 'unavailable' ELSE 'other' END);

  INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
  VALUES (v_refused, v_paid, 'refuse', 'like');
  BEGIN
    PERFORM public.insert_chat_message(v_refused, 'refus');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  v_out := v_out || jsonb_build_object('refused',
    CASE WHEN v_err ILIKE '%member_unavailable%' THEN 'unavailable' ELSE 'other' END);

  INSERT INTO public.discovery_passes (from_user, to_user)
  VALUES (v_passed, v_paid);
  BEGIN
    PERFORM public.insert_chat_message(v_passed, 'passe');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  v_out := v_out || jsonb_build_object('passed',
    CASE WHEN v_err ILIKE '%member_unavailable%' THEN 'unavailable' ELSE 'other' END);

  v_i := 0;
  FOREACH v_extra IN ARRAY v_ids LOOP
    IF v_extra IN (v_paid, v_free, v_closed, v_open, v_reply, v_paused, v_deleted, v_refused, v_passed, v_post, v_peer, v_born) THEN
      CONTINUE;
    END IF;
    UPDATE public.profiles SET accepts_messages_without_match = true WHERE id = v_extra;
    v_i := v_i + 1;
    IF v_i = 1 THEN
      UPDATE public.memberships SET plan = 'essentiel' WHERE user_id = v_paid;
    ELSIF v_i = 2 THEN
      UPDATE public.memberships SET plan = 'confort' WHERE user_id = v_paid;
    ELSIF v_i = 3 THEN
      UPDATE public.memberships SET plan = 'premium' WHERE user_id = v_paid;
    ELSIF v_i = 4 THEN
      UPDATE public.memberships
      SET plan = 'founder', is_founder = true, founder_premium_until = now() + interval '30 days'
      WHERE user_id = v_paid;
    END IF;
    BEGIN
      PERFORM public.insert_chat_message(v_extra, 'plan' || v_i::text);
      v_err := 'ok';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;
    IF v_i = 1 THEN
      v_out := v_out || jsonb_build_object('essentiel', CASE WHEN v_err = 'ok' THEN 'ok' ELSE 'other' END);
    ELSIF v_i = 2 THEN
      v_out := v_out || jsonb_build_object('confort', CASE WHEN v_err = 'ok' THEN 'ok' ELSE 'other' END);
    ELSIF v_i = 3 THEN
      v_out := v_out || jsonb_build_object('premium', CASE WHEN v_err = 'ok' THEN 'ok' ELSE 'other' END);
    ELSIF v_i = 4 THEN
      v_out := v_out || jsonb_build_object('founder', CASE WHEN v_err = 'ok' THEN 'ok' ELSE 'other' END);
    ELSIF v_err = 'ok' THEN
      NULL;
    ELSIF v_code IS NULL THEN
      v_code := CASE WHEN v_err ILIKE '%messages_without_match_daily_limit%' THEN 'limit' ELSE 'other' END;
    END IF;
  END LOOP;
  SELECT n INTO v_n FROM public.message_openers_daily WHERE user_id = v_paid;
  v_out := v_out || jsonb_build_object('cap', COALESCE(v_code, 'missing'), 'cap_n', v_n);

  INSERT INTO public.likes (from_user, to_user)
  VALUES (v_post, v_peer), (v_peer, v_post)
  ON CONFLICT (from_user, to_user) DO NOTHING;
  INSERT INTO public.match_bonds (user_a, user_b, origin)
  VALUES (LEAST(v_post, v_peer), GREATEST(v_post, v_peer), 'like')
  ON CONFLICT (user_a, user_b) DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', v_post::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_post, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.insert_chat_message(v_peer, 'match');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  v_out := v_out || jsonb_build_object('match_after_trial',
    CASE
      WHEN v_err ILIKE '%payment_required%'
       AND v_err NOT ILIKE '%sender_plan_required%' THEN 'payment'
      ELSE 'other'
    END);

  UPDATE public.messages
  SET created_at = now() - interval '1 minute'
  WHERE sender_id = v_paid
    AND recipient_id = v_post
    AND content = 'bonjour';

  INSERT INTO public.match_bonds (user_a, user_b, origin, created_at)
  VALUES (
    LEAST(v_paid, v_post),
    GREATEST(v_paid, v_post),
    'like',
    now()
  )
  ON CONFLICT (user_a, user_b) DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', v_post::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_post, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.insert_chat_message(v_paid, 'apres-match');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  v_out := v_out || jsonb_build_object('cold_then_match',
    CASE WHEN v_err = 'ok' THEN 'ok' ELSE 'other' END);

  UPDATE public.profiles SET accepts_messages_without_match = true WHERE id = v_born;
  INSERT INTO public.match_bonds (user_a, user_b, origin, created_at)
  VALUES (
    LEAST(v_paid, v_born),
    GREATEST(v_paid, v_born),
    'like',
    now() - interval '1 day'
  )
  ON CONFLICT (user_a, user_b) DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub', v_paid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_paid, 'role', 'authenticated')::text, true);
  PERFORM public.insert_chat_message(v_born, 'ne-du-match');
  PERFORM set_config('request.jwt.claim.sub', v_born::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_born, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.insert_chat_message(v_paid, 'reponse-du-match');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  v_out := v_out || jsonb_build_object('match_born_reply',
    CASE
      WHEN v_err ILIKE '%payment_required%'
       AND v_err NOT ILIKE '%sender_plan_required%' THEN 'payment'
      ELSE 'other'
    END);

  PERFORM set_config('request.jwt.claim.sub', v_free::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free, 'role', 'authenticated')::text, true);
  SELECT p.messages_without_match_notice_seen INTO v_notice FROM public.my_profile() p;
  IF v_notice IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'notice_not_default_false';
  END IF;
  UPDATE public.profiles
  SET messages_without_match_notice_seen = true
  WHERE id = v_free;
  PERFORM set_config('request.jwt.claim.sub', v_paid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_paid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_free::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free, 'role', 'authenticated')::text, true);
  SELECT p.messages_without_match_notice_seen INTO v_notice FROM public.my_profile() p;
  UPDATE public.profiles SET discover_mode = 'simplifie' WHERE id = v_free;
  SELECT p.messages_without_match_notice_seen INTO v_kept FROM public.my_profile() p;
  v_out := v_out || jsonb_build_object('notice_stays',
    CASE WHEN v_notice AND v_kept THEN 'seen' ELSE 'back' END);

  v_out := v_out || jsonb_build_object(
    'anon_counter', has_table_privilege('anon', 'public.message_openers_daily', 'SELECT'),
    'auth_counter', has_table_privilege('authenticated', 'public.message_openers_daily', 'SELECT'),
    'owner_update', has_column_privilege('authenticated', 'public.profiles', 'accepts_messages_without_match', 'UPDATE')
  );

  RAISE EXCEPTION 'AYPIK_RESULTS %', v_out;
END
$$;
