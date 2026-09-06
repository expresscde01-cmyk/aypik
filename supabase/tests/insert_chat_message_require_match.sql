-- insert_chat_message refuse l’envoi hors Match (users_are_matched),
-- même si les deux comptes sont actifs. Exécuter d’un coup (ROLLBACK).

BEGIN;

DO $$
DECLARE
  v_instance uuid;
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_msg public.messages;
  v_caught boolean := false;
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
      'chat-gate-a-' || v_a::text || '@aypik.test',
      'chat-gate-test',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      v_instance, v_b, 'authenticated', 'authenticated',
      'chat-gate-b-' || v_b::text || '@aypik.test',
      'chat-gate-test',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', ''
    );

  INSERT INTO public.profiles (id, display_name, birth_date)
  VALUES
    (v_a, 'Chat A', DATE '1990-01-01'),
    (v_b, 'Chat B', DATE '1990-01-01');

  PERFORM set_config('request.jwt.claim.sub', v_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    v_msg := public.insert_chat_message(v_b, 'bonjour hors match');
    RAISE EXCEPTION 'unmatched_insert_was_allowed';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%not_matched%' THEN
        v_caught := true;
      ELSE
        RAISE EXCEPTION 'expected_not_matched_got: %', SQLERRM;
      END IF;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'unmatched_insert_did_not_raise';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.messages
    WHERE sender_id = v_a AND recipient_id = v_b
  ) THEN
    RAISE EXCEPTION 'unmatched_message_row_inserted';
  END IF;

  INSERT INTO public.likes (from_user, to_user)
  VALUES (v_a, v_b), (v_b, v_a)
  ON CONFLICT (from_user, to_user) DO NOTHING;

  INSERT INTO public.match_bonds (user_a, user_b, origin)
  VALUES (LEAST(v_a, v_b), GREATEST(v_a, v_b), 'like')
  ON CONFLICT (user_a, user_b) DO NOTHING;

  IF NOT public.users_are_matched(v_a, v_b) THEN
    RAISE EXCEPTION 'fixture_not_matched_after_likes';
  END IF;

  v_msg := public.insert_chat_message(v_b, 'bonjour après match');

  IF v_msg.id IS NULL OR v_msg.content IS DISTINCT FROM 'bonjour après match' THEN
    RAISE EXCEPTION 'matched_insert_failed';
  END IF;

  RAISE NOTICE 'insert_chat_message_require_match_ok';
END
$$;

ROLLBACK;
