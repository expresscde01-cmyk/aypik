-- Lancement non lucratif : 100 fondateurs, aucun achat, boost offert le 1er mois.
-- payment_status 'simulated' + amount_cents 0 = boost complémentaire (CHECK existant).

INSERT INTO platform_settings (key, value) VALUES
  ('founder_max_slots', '100'::jsonb),
  ('payments_enabled', '0'::jsonb)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

CREATE OR REPLACE FUNCTION grant_founder_first_month_boost(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m memberships%ROWTYPE;
  boost_until timestamptz;
BEGIN
  SELECT * INTO m FROM memberships WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT (m.is_founder OR m.plan = 'founder') THEN
    RETURN;
  END IF;

  boost_until := COALESCE(m.created_at, now()) + interval '1 month';
  IF boost_until <= now() THEN
    RETURN;
  END IF;

  UPDATE profile_boosts
  SET ends_at = GREATEST(ends_at, boost_until),
      payment_status = 'simulated',
      amount_cents = 0
  WHERE user_id = p_user_id
    AND payment_status IN ('paid', 'simulated')
    AND amount_cents = 0
    AND ends_at > now();

  IF FOUND THEN
    RETURN;
  END IF;

  INSERT INTO profile_boosts (user_id, starts_at, ends_at, payment_status, amount_cents)
  VALUES (p_user_id, now(), boost_until, 'simulated', 0);
END;
$$;

REVOKE ALL ON FUNCTION grant_founder_first_month_boost(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_founder_first_month_boost(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION try_claim_founder_slot(p_user_id uuid)
RETURNS memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_slots integer;
  months integer;
  next_number integer;
  result memberships;
BEGIN
  SELECT * INTO result FROM memberships WHERE user_id = p_user_id;
  IF FOUND THEN
    IF result.is_founder OR result.plan = 'founder' THEN
      PERFORM grant_founder_first_month_boost(p_user_id);
    END IF;
    RETURN result;
  END IF;

  max_slots := get_setting_int('founder_max_slots', 100);
  months := get_setting_int('founder_premium_months', 6);

  PERFORM pg_advisory_xact_lock(872014);

  IF count_founders() >= max_slots THEN
    INSERT INTO memberships (user_id, plan, is_founder)
    VALUES (p_user_id, 'free', false)
    RETURNING * INTO result;
    RETURN result;
  END IF;

  SELECT COALESCE(MAX(founder_number), 0) + 1 INTO next_number
  FROM memberships
  WHERE is_founder = true;

  INSERT INTO memberships (
    user_id,
    plan,
    is_founder,
    founder_number,
    founder_premium_until
  ) VALUES (
    p_user_id,
    'founder',
    true,
    next_number,
    now() + make_interval(months => months)
  )
  RETURNING * INTO result;

  PERFORM grant_founder_first_month_boost(p_user_id);

  INSERT INTO membership_notifications (user_id, kind, title, body)
  VALUES (
    p_user_id,
    'founder_welcome',
    'Bienvenue, Membre Fondateur',
    'Vous faites partie des 100 premiers. Likes illimités et boost profil offert le 1er mois, avec votre badge distinctif.'
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION try_claim_founder_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION try_claim_founder_slot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION purchase_boost()
RETURNS profile_boosts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  m memberships%ROWTYPE;
  result profile_boosts;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF get_setting_int('payments_enabled', 0) = 0 THEN
    RAISE EXCEPTION 'payments_disabled';
  END IF;

  SELECT * INTO m FROM memberships WHERE user_id = uid;
  IF FOUND AND (m.is_founder OR m.plan = 'founder') THEN
    RAISE EXCEPTION 'boost_not_available_for_founders';
  END IF;

  UPDATE profile_boosts
  SET ends_at = GREATEST(ends_at, now()) + interval '24 hours',
      payment_status = 'simulated'
  WHERE user_id = uid
    AND payment_status IN ('paid', 'simulated')
    AND ends_at > now()
  RETURNING * INTO result;

  IF FOUND THEN
    INSERT INTO membership_notifications (user_id, kind, title, body)
    VALUES (
      uid,
      'boost_activated',
      'Boost prolongé',
      'Votre profil reste mis en avant pour 24 heures supplémentaires.'
    );
    RETURN result;
  END IF;

  INSERT INTO profile_boosts (user_id, starts_at, ends_at, payment_status, amount_cents)
  VALUES (uid, now(), now() + interval '24 hours', 'simulated', 299)
  RETURNING * INTO result;

  INSERT INTO membership_notifications (user_id, kind, title, body)
  VALUES (
    uid,
    'boost_activated',
    'Boost activé',
    'Votre profil est mis en avant pendant 24 heures.'
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION purchase_boost() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purchase_boost() TO authenticated;

-- Fondateurs déjà inscrits : boost complémentaire sur le 1er mois restant.
SELECT grant_founder_first_month_boost(user_id)
FROM memberships
WHERE is_founder = true OR plan = 'founder';

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
