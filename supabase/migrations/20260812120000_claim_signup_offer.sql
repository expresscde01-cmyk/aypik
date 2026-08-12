/*
  Tunnel d’inscription : choix d’offre obligatoire avant le profil.
  - claim_signup_offer('founder'|'free') : rattache l’offre sans profil
  - get_my_membership_status expose membership_linked
  - trigger profil : freemium de secours seulement (pas de Fondateur auto)
*/

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

CREATE OR REPLACE FUNCTION ensure_my_membership()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  m memberships%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO m FROM memberships WHERE user_id = uid;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM profiles WHERE id = uid) THEN
      INSERT INTO memberships (user_id, plan, is_founder)
      VALUES (uid, 'free', false)
      ON CONFLICT (user_id) DO NOTHING;
      SELECT * INTO m FROM memberships WHERE user_id = uid;
    ELSE
      RETURN jsonb_build_object(
        'linked', false,
        'error', 'offer_required',
        'plan', null,
        'is_founder', false
      );
    END IF;
  END IF;

  IF m.user_id IS NULL THEN
    RETURN jsonb_build_object(
      'linked', false,
      'error', 'claim_failed',
      'plan', null,
      'is_founder', false
    );
  END IF;

  IF m.is_founder
     AND m.plan = 'founder'
     AND m.founder_premium_until IS NOT NULL
     AND m.founder_premium_until <= now() THEN
    UPDATE memberships
    SET plan = 'free', updated_at = now()
    WHERE user_id = uid
    RETURNING * INTO m;
  END IF;

  IF m.plan IS NULL OR m.plan NOT IN ('free', 'founder', 'premium') THEN
    RETURN jsonb_build_object(
      'linked', false,
      'error', 'invalid_plan',
      'plan', m.plan,
      'is_founder', m.is_founder
    );
  END IF;

  RETURN jsonb_build_object(
    'linked', true,
    'error', null,
    'plan', m.plan,
    'is_founder', m.is_founder,
    'founder_number', m.founder_number,
    'founder_premium_until', m.founder_premium_until,
    'user_id', m.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION ensure_my_membership() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_my_membership() TO authenticated;

-- Création profil : ne plus forcer Fondateur sans choix explicite
CREATE OR REPLACE FUNCTION on_profile_created_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships WHERE user_id = NEW.id) THEN
    INSERT INTO memberships (user_id, plan, is_founder)
    VALUES (NEW.id, 'free', false)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_claim_membership ON profiles;
CREATE TRIGGER profiles_claim_membership
AFTER INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION on_profile_created_membership();

CREATE OR REPLACE FUNCTION get_my_membership_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  m memberships%ROWTYPE;
  founders_count integer;
  max_slots integer;
  free_likes integer;
  likes_today integer;
  boost_ends timestamptz;
  premium boolean;
  boosted boolean;
  price_cents integer;
  currency text;
  interval_label text;
  founder_trial_cents integer;
  founder_months integer;
  on_founder_trial boolean;
  effective_price_cents integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO m FROM memberships WHERE user_id = uid;
  IF NOT FOUND THEN
    price_cents := get_setting_int('premium_price_cents', 1999);
    RETURN jsonb_build_object(
      'membership_linked', false,
      'plan', 'free',
      'is_founder', false,
      'has_premium', false,
      'has_boost', false,
      'founders_remaining', GREATEST(
        get_setting_int('founder_max_slots', 500) - count_founders(),
        0
      ),
      'founders_taken', count_founders(),
      'founders_max', get_setting_int('founder_max_slots', 500),
      'premium_price_cents', price_cents,
      'premium_currency', get_setting_text('premium_currency', 'EUR'),
      'premium_interval', get_setting_text('premium_interval', 'month'),
      'founder_trial_price_cents', get_setting_int('founder_trial_price_cents', 0),
      'founder_premium_months', get_setting_int('founder_premium_months', 6),
      'on_founder_trial', false,
      'effective_price_cents', price_cents
    );
  END IF;

  IF m.is_founder
     AND m.plan = 'founder'
     AND m.founder_premium_until IS NOT NULL
     AND m.founder_premium_until <= now() THEN
    UPDATE memberships
    SET plan = 'free', updated_at = now()
    WHERE user_id = uid;
    m.plan := 'free';
  END IF;

  premium := has_active_premium(uid);
  boosted := has_active_boost(uid);
  founders_count := count_founders();
  max_slots := get_setting_int('founder_max_slots', 500);
  free_likes := get_setting_int('free_daily_likes', 10);
  price_cents := get_setting_int('premium_price_cents', 1999);
  currency := get_setting_text('premium_currency', 'EUR');
  interval_label := get_setting_text('premium_interval', 'month');
  founder_trial_cents := get_setting_int('founder_trial_price_cents', 0);
  founder_months := get_setting_int('founder_premium_months', 6);

  on_founder_trial := m.is_founder
    AND m.founder_premium_until IS NOT NULL
    AND m.founder_premium_until > now()
    AND premium;

  effective_price_cents := CASE
    WHEN on_founder_trial THEN founder_trial_cents
    ELSE price_cents
  END;

  SELECT COUNT(*)::integer INTO likes_today
  FROM likes
  WHERE from_user = uid
    AND created_at >= date_trunc('day', now());

  SELECT MAX(ends_at) INTO boost_ends
  FROM profile_boosts
  WHERE user_id = uid
    AND payment_status IN ('paid', 'simulated')
    AND ends_at > now();

  RETURN jsonb_build_object(
    'membership_linked', true,
    'user_id', uid,
    'plan', m.plan,
    'is_founder', m.is_founder,
    'founder_number', m.founder_number,
    'founder_premium_until', m.founder_premium_until,
    'premium_until', m.premium_until,
    'has_premium', premium,
    'has_boost', boosted,
    'boost_ends_at', boost_ends,
    'founders_taken', founders_count,
    'founders_max', max_slots,
    'founders_remaining', GREATEST(max_slots - founders_count, 0),
    'free_daily_likes', free_likes,
    'likes_used_today', likes_today,
    'likes_remaining_today', CASE
      WHEN premium THEN NULL
      ELSE GREATEST(free_likes - likes_today, 0)
    END,
    'can_see_who_liked', premium,
    'can_use_advanced_filters', premium,
    'unlimited_likes', premium,
    'premium_price_cents', price_cents,
    'premium_currency', currency,
    'premium_interval', interval_label,
    'founder_trial_price_cents', founder_trial_cents,
    'founder_premium_months', founder_months,
    'on_founder_trial', on_founder_trial,
    'effective_price_cents', effective_price_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION get_my_membership_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_membership_status() TO authenticated;

SELECT pg_notification_queue_usage();
NOTIFY pgrst, 'reload schema';
