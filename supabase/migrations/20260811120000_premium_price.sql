/*
# Tarif Premium de référence : 19,99 € / mois

- Stocké en centimes dans platform_settings (premium_price_cents = 1999)
- Exposé via get_my_membership_status pour l'UI
- Membres Fondateurs : 6 mois à 0 €, puis reconduction possible au tarif standard
*/

INSERT INTO platform_settings (key, value) VALUES
  ('premium_price_cents', '1999'::jsonb),
  ('premium_currency', '"EUR"'::jsonb),
  ('premium_interval', '"month"'::jsonb),
  ('founder_trial_price_cents', '0'::jsonb)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

CREATE OR REPLACE FUNCTION get_setting_text(p_key text, p_default text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v jsonb;
BEGIN
  SELECT value INTO v FROM platform_settings WHERE key = p_key;
  IF v IS NULL THEN
    RETURN p_default;
  END IF;
  RETURN v #>> '{}';
END;
$$;

CREATE OR REPLACE FUNCTION get_my_membership_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
    IF EXISTS (SELECT 1 FROM profiles WHERE id = uid) THEN
      m := try_claim_founder_slot(uid);
    ELSE
      price_cents := get_setting_int('premium_price_cents', 1999);
      RETURN jsonb_build_object(
        'plan', 'free',
        'is_founder', false,
        'has_premium', false,
        'has_boost', false,
        'founders_remaining', get_setting_int('founder_max_slots', 500),
        'premium_price_cents', price_cents,
        'premium_currency', get_setting_text('premium_currency', 'EUR'),
        'premium_interval', get_setting_text('premium_interval', 'month'),
        'founder_trial_price_cents', get_setting_int('founder_trial_price_cents', 0),
        'founder_premium_months', get_setting_int('founder_premium_months', 6),
        'on_founder_trial', false,
        'effective_price_cents', price_cents
      );
    END IF;
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

-- Notifications d'expiration : mentionner le tarif de reconduction
CREATE OR REPLACE FUNCTION process_founder_expirations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  warning_days integer;
  n_warned integer := 0;
  n_expired integer := 0;
  price_cents integer;
  price_label text;
BEGIN
  warning_days := get_setting_int('founder_warning_days', 14);
  price_cents := get_setting_int('premium_price_cents', 1999);
  price_label := replace(to_char(price_cents / 100.0, 'FM999990D00'), '.', ',') || ' €/mois';

  WITH due AS (
    UPDATE memberships m
    SET founder_expiry_notified_at = now(),
        updated_at = now()
    WHERE m.is_founder = true
      AND m.founder_premium_until IS NOT NULL
      AND m.founder_premium_until > now()
      AND m.founder_premium_until <= now() + make_interval(days => warning_days)
      AND m.founder_expiry_notified_at IS NULL
    RETURNING m.user_id, m.founder_premium_until
  )
  INSERT INTO membership_notifications (user_id, kind, title, body)
  SELECT
    user_id,
    'founder_expiring_soon',
    'Votre période Fondateur touche à sa fin',
    'Votre Premium gratuit (0 €) se termine bientôt. Vous pourrez rester en freemium, ou reconduire en soutien à '
      || price_label || '.'
  FROM due;

  GET DIAGNOSTICS n_warned = ROW_COUNT;

  WITH expired AS (
    UPDATE memberships m
    SET plan = 'free',
        updated_at = now()
    WHERE m.is_founder = true
      AND m.plan = 'founder'
      AND m.founder_premium_until IS NOT NULL
      AND m.founder_premium_until <= now()
    RETURNING m.user_id
  )
  INSERT INTO membership_notifications (user_id, kind, title, body)
  SELECT
    user_id,
    'founder_expired',
    'Merci d''avoir été Membre Fondateur',
    'Vos 6 mois à 0 € sont terminés. Votre badge Fondateur reste visible. Soutenez la plateforme à '
      || price_label || ' pour retrouver le confort Premium.'
  FROM expired;

  GET DIAGNOSTICS n_expired = ROW_COUNT;

  RETURN n_warned + n_expired;
END;
$$;
