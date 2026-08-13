-- Messaging only if matched AND the peer is not younger than half-plus-seven.

CREATE OR REPLACE FUNCTION public.users_are_matched(u1 uuid, u2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM likes l1
    JOIN likes l2
      ON l1.from_user = l2.to_user
     AND l1.to_user = l2.from_user
    JOIN profiles p1 ON p1.id = u1
    JOIN profiles p2 ON p2.id = u2
    WHERE l1.from_user = u1
      AND l1.to_user = u2
      AND public.dating_partner_old_enough(p1.birth_date, p2.birth_date)
      AND public.dating_partner_old_enough(p2.birth_date, p1.birth_date)
  );
$$;

REVOKE ALL ON FUNCTION public.users_are_matched(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.users_are_matched(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  a uuid;
  b uuid;
  conv_id uuid;
  my_birth date;
  their_birth date;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF other_user IS NULL OR other_user = me THEN
    RAISE EXCEPTION 'invalid_participant';
  END IF;

  SELECT birth_date INTO my_birth FROM profiles WHERE id = me;
  SELECT birth_date INTO their_birth FROM profiles WHERE id = other_user;

  IF my_birth IS NULL OR their_birth IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF NOT public.dating_partner_old_enough(my_birth, their_birth) THEN
    RAISE EXCEPTION 'age_rule_violation';
  END IF;

  IF NOT public.users_are_matched(me, other_user) THEN
    RAISE EXCEPTION 'not_matched';
  END IF;

  a := LEAST(me, other_user);
  b := GREATEST(me, other_user);

  SELECT id INTO conv_id
  FROM conversations
  WHERE user_a = a AND user_b = b;

  IF conv_id IS NOT NULL THEN
    RETURN conv_id;
  END IF;

  INSERT INTO conversations (user_a, user_b)
  VALUES (a, b)
  ON CONFLICT (user_a, user_b) DO NOTHING;

  SELECT id INTO conv_id
  FROM conversations
  WHERE user_a = a AND user_b = b;

  RETURN conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;
