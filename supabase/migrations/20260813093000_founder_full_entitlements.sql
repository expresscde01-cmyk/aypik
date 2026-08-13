-- Membres fondateurs : mêmes droits que Premium (likes, qui a liké, filtres, flash)
-- sauf le Boost, qu'ils n'ont pas.

CREATE OR REPLACE FUNCTION has_active_premium(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m memberships%ROWTYPE;
BEGIN
  SELECT * INTO m FROM memberships WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF m.plan = 'premium'
     AND (m.premium_until IS NULL OR m.premium_until > now()) THEN
    RETURN true;
  END IF;

  -- Plan founder encore en cours (date absente = on accorde le bénéfice)
  IF m.plan = 'founder'
     AND (m.founder_premium_until IS NULL OR m.founder_premium_until > now()) THEN
    RETURN true;
  END IF;

  IF m.is_founder
     AND m.founder_premium_until IS NOT NULL
     AND m.founder_premium_until > now() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

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
  founder_entitled boolean;
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
      'effective_price_cents', price_cents,
      'unlimited_likes', false,
      'likes_remaining_today', get_setting_int('free_daily_likes', 10),
      'can_see_who_liked', false,
      'can_use_advanced_filters', false
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

  founder_entitled :=
    (m.plan = 'founder'
      AND (m.founder_premium_until IS NULL OR m.founder_premium_until > now()))
    OR (m.is_founder
      AND m.founder_premium_until IS NOT NULL
      AND m.founder_premium_until > now());

  premium := has_active_premium(uid) OR founder_entitled;
  boosted := has_active_boost(uid);
  founders_count := count_founders();
  max_slots := get_setting_int('founder_max_slots', 500);
  free_likes := get_setting_int('free_daily_likes', 10);
  price_cents := get_setting_int('premium_price_cents', 1999);
  currency := get_setting_text('premium_currency', 'EUR');
  interval_label := get_setting_text('premium_interval', 'month');
  founder_trial_cents := get_setting_int('founder_trial_price_cents', 0);
  founder_months := get_setting_int('founder_premium_months', 6);

  on_founder_trial := founder_entitled;

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
GRANT EXECUTE ON FUNCTION has_active_premium(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
