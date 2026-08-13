-- L'API PostgREST ne voyait pas public.memberships (schema cache)
-- et n'exposait pas claim_signup_offer. Le bouton Fondateur échouait.

GRANT SELECT, INSERT, UPDATE ON TABLE public.memberships TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION claim_signup_offer(p_offer text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  m memberships%ROWTYPE;
  offer text := lower(trim(p_offer));
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF offer IS NULL OR offer NOT IN ('founder', 'free') THEN
    RETURN jsonb_build_object(
      'linked', false,
      'error', 'invalid_offer',
      'plan', null,
      'is_founder', false
    );
  END IF;

  SELECT * INTO m FROM memberships WHERE user_id = uid;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'linked', true,
      'error', null,
      'plan', m.plan,
      'is_founder', m.is_founder,
      'founder_number', m.founder_number,
      'founder_premium_until', m.founder_premium_until,
      'user_id', m.user_id,
      'already_linked', true
    );
  END IF;

  IF offer = 'founder' THEN
    m := try_claim_founder_slot(uid);
  ELSE
    INSERT INTO memberships (user_id, plan, is_founder)
    VALUES (uid, 'free', false)
    RETURNING * INTO m;
  END IF;

  IF m.user_id IS NULL THEN
    SELECT * INTO m FROM memberships WHERE user_id = uid;
  END IF;

  IF m.user_id IS NULL THEN
    RETURN jsonb_build_object(
      'linked', false,
      'error', 'claim_failed',
      'plan', null,
      'is_founder', false
    );
  END IF;

  RETURN jsonb_build_object(
    'linked', true,
    'error', null,
    'plan', m.plan,
    'is_founder', m.is_founder,
    'founder_number', m.founder_number,
    'founder_premium_until', m.founder_premium_until,
    'user_id', m.user_id,
    'already_linked', false
  );
END;
$$;

REVOKE ALL ON FUNCTION claim_signup_offer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_signup_offer(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
