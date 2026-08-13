-- Aypik — activation Membre Fondateur (à exécuter dans le SQL Editor
-- du projet utilisé par aypik.fr). Idempotent.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;


-- ===== 20260811110000_freemium_membership.sql =====

/*
# Freemium éthique — membership, boosts, membres fondateurs

## Modèle
- Freemium : inscription, profil, navigation, messages après match = gratuits
- Premium : qui m'a liké, filtres avancés, likes illimités
- Boost 24h : micro-paiement ponctuel
- Membres fondateurs : 500 places max, Premium gratuit 6 mois, badge distinctif

## Tables
- platform_settings : quotas / config
- memberships : statut d'abonnement par utilisateur
- profile_boosts : boosts de 24h
- membership_notifications : notifications (ex. fin de période fondateur)
*/

-- ===== Config plateforme =====
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (key, value) VALUES
  ('founder_max_slots', '100'::jsonb),
  ('founder_premium_months', '6'::jsonb),
  ('founder_warning_days', '14'::jsonb),
  ('free_daily_likes', '10'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_settings_select_auth" ON platform_settings;
CREATE POLICY "platform_settings_select_auth"
ON platform_settings FOR SELECT
TO authenticated USING (true);

-- ===== Memberships =====
CREATE TABLE IF NOT EXISTS memberships (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'premium', 'founder')),
  is_founder boolean NOT NULL DEFAULT false,
  founder_number integer UNIQUE,
  founder_premium_until timestamptz,
  premium_until timestamptz,
  founder_expiry_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memberships_plan ON memberships(plan);
CREATE INDEX IF NOT EXISTS idx_memberships_is_founder ON memberships(is_founder)
  WHERE is_founder = true;
CREATE INDEX IF NOT EXISTS idx_memberships_founder_premium_until
  ON memberships(founder_premium_until)
  WHERE is_founder = true;

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memberships_select_all" ON memberships;
CREATE POLICY "memberships_select_all"
ON memberships FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "memberships_insert_own" ON memberships;
CREATE POLICY "memberships_insert_own"
ON memberships FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "memberships_update_own" ON memberships;
CREATE POLICY "memberships_update_own"
ON memberships FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS memberships_updated_at ON memberships;
CREATE TRIGGER memberships_updated_at
BEFORE UPDATE ON memberships
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===== Profile boosts (24h) =====
CREATE TABLE IF NOT EXISTS profile_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'simulated', 'failed', 'refunded')),
  amount_cents integer NOT NULL DEFAULT 299,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_boosts_user ON profile_boosts(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_boosts_active
  ON profile_boosts(user_id, ends_at)
  WHERE payment_status IN ('paid', 'simulated');

ALTER TABLE profile_boosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boosts_select_all" ON profile_boosts;
CREATE POLICY "boosts_select_all"
ON profile_boosts FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "boosts_insert_own" ON profile_boosts;
CREATE POLICY "boosts_insert_own"
ON profile_boosts FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

-- ===== Notifications membership =====
CREATE TABLE IF NOT EXISTS membership_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN (
      'founder_welcome',
      'founder_expiring_soon',
      'founder_expired',
      'premium_activated',
      'boost_activated'
    )),
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_notifications_user
  ON membership_notifications(user_id, created_at DESC);

ALTER TABLE membership_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON membership_notifications;
CREATE POLICY "notifications_select_own"
ON membership_notifications FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update_own" ON membership_notifications;
CREATE POLICY "notifications_update_own"
ON membership_notifications FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== Helpers =====
CREATE OR REPLACE FUNCTION get_setting_int(p_key text, p_default integer)
RETURNS integer
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
  RETURN (v #>> '{}')::integer;
END;
$$;

CREATE OR REPLACE FUNCTION count_founders()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::integer FROM memberships WHERE is_founder = true;
$$;

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

  IF m.is_founder
     AND m.founder_premium_until IS NOT NULL
     AND m.founder_premium_until > now() THEN
    RETURN true;
  END IF;

  IF m.plan = 'premium'
     AND (m.premium_until IS NULL OR m.premium_until > now()) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION has_active_boost(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profile_boosts
    WHERE user_id = p_user_id
      AND payment_status IN ('paid', 'simulated')
      AND ends_at > now()
  );
$$;

-- ===== Attribution membre fondateur (numerus clausus 500) =====
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
  -- Déjà membre ?
  SELECT * INTO result FROM memberships WHERE user_id = p_user_id;
  IF FOUND THEN
    RETURN result;
  END IF;

  max_slots := get_setting_int('founder_max_slots', 500);
  months := get_setting_int('founder_premium_months', 6);

  -- Verrouillage pour éviter les courses au-delà de 500
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

  INSERT INTO membership_notifications (user_id, kind, title, body)
  VALUES (
    p_user_id,
    'founder_welcome',
    'Bienvenue, Membre Fondateur',
    'Vous faites partie des 500 premiers. Profitez du Premium gratuit pendant 6 mois, avec votre badge distinctif.'
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION try_claim_founder_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION try_claim_founder_slot(uuid) TO authenticated;

-- Auto-création membership à l'insertion d'un profil
CREATE OR REPLACE FUNCTION on_profile_created_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM try_claim_founder_slot(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_claim_membership ON profiles;
CREATE TRIGGER profiles_claim_membership
AFTER INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION on_profile_created_membership();

-- ===== Boost 24h (paiement simulé en attendant le PSP) =====
CREATE OR REPLACE FUNCTION purchase_boost()
RETURNS profile_boosts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  result profile_boosts;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Prolongation si un boost actif existe déjà
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

-- ===== Expiration fondateurs + notification préventive =====
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
BEGIN
  warning_days := get_setting_int('founder_warning_days', 14);

  -- Notification préventive (dans les X jours avant expiration)
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
    'Dans quelques jours, votre Premium gratuit prendra fin. Vous pourrez continuer en mode freemium, ou soutenir la communauté via une reconduction Premium.'
  FROM due;

  GET DIAGNOSTICS n_warned = ROW_COUNT;

  -- Expiration effective : retour freemium (badge fondateur conservé)
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
    'Votre Premium gratuit de 6 mois est terminé. Votre badge Fondateur reste visible. Soutenez la plateforme pour retrouver le confort Premium.'
  FROM expired;

  GET DIAGNOSTICS n_expired = ROW_COUNT;

  RETURN n_warned + n_expired;
END;
$$;

REVOKE ALL ON FUNCTION process_founder_expirations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_founder_expirations() TO authenticated;

-- ===== Vue / RPC statut membership pour le client =====
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
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO m FROM memberships WHERE user_id = uid;
  IF NOT FOUND THEN
    -- Lazy claim si profil existe déjà
    IF EXISTS (SELECT 1 FROM profiles WHERE id = uid) THEN
      m := try_claim_founder_slot(uid);
    ELSE
      RETURN jsonb_build_object(
        'plan', 'free',
        'is_founder', false,
        'has_premium', false,
        'has_boost', false,
        'founders_remaining', get_setting_int('founder_max_slots', 500)
      );
    END IF;
  END IF;

  -- Si fondateur expiré mais plan encore 'founder', normaliser côté lecture
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
    'unlimited_likes', premium
  );
END;
$$;

REVOKE ALL ON FUNCTION get_my_membership_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_membership_status() TO authenticated;

GRANT EXECUTE ON FUNCTION has_active_premium(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION has_active_boost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION count_founders() TO authenticated;


-- ===== 20260811120000_premium_price.sql =====

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


-- ===== 20260811130000_payment_subscriptions.sql =====

/*
# Infrastructure abonnement Premium (Stripe + PayPal)

Tables de suivi des abonnements récurrents et colonnes de liaison
sur memberships. Le tarif de référence reste platform_settings.premium_price_cents (1999).
*/

CREATE TABLE IF NOT EXISTS payment_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'paypal')),
  provider_subscription_id text,
  provider_customer_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'active',
      'past_due',
      'canceled',
      'incomplete',
      'trialing'
    )),
  amount_cents integer NOT NULL DEFAULT 1999,
  currency text NOT NULL DEFAULT 'EUR',
  interval text NOT NULL DEFAULT 'month',
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_subs_provider_id
  ON payment_subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_subs_user
  ON payment_subscriptions(user_id, created_at DESC);

ALTER TABLE payment_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_subs_select_own" ON payment_subscriptions;
CREATE POLICY "payment_subs_select_own"
ON payment_subscriptions FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS payment_subscriptions_updated_at ON payment_subscriptions;
CREATE TRIGGER payment_subscriptions_updated_at
BEFORE UPDATE ON payment_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS paypal_subscriber_id text,
  ADD COLUMN IF NOT EXISTS payment_provider text
    CHECK (payment_provider IS NULL OR payment_provider IN ('stripe', 'paypal', 'founder'));

-- Active Premium payant (hors période fondateur gratuite)
CREATE OR REPLACE FUNCTION activate_paid_premium(
  p_user_id uuid,
  p_provider text,
  p_period_end timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO memberships (user_id, plan, premium_until, payment_provider)
  VALUES (
    p_user_id,
    'premium',
    COALESCE(p_period_end, now() + interval '1 month'),
    p_provider
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan = 'premium',
    premium_until = COALESCE(p_period_end, now() + interval '1 month'),
    payment_provider = p_provider,
    updated_at = now();

  INSERT INTO membership_notifications (user_id, kind, title, body)
  VALUES (
    p_user_id,
    'premium_activated',
    'Premium activé',
    'Merci pour votre soutien. Votre abonnement Premium est actif. Vous pouvez le résilier à tout moment en un clic depuis votre profil.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION cancel_paid_premium(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m memberships%ROWTYPE;
BEGIN
  SELECT * INTO m FROM memberships WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Ne pas retirer le badge fondateur ; bascule freemium si plus de période fondateur active
  IF m.is_founder
     AND m.founder_premium_until IS NOT NULL
     AND m.founder_premium_until > now() THEN
    UPDATE memberships
    SET plan = 'founder',
        payment_provider = 'founder',
        updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE memberships
    SET plan = 'free',
        premium_until = NULL,
        payment_provider = NULL,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  UPDATE payment_subscriptions
  SET status = 'canceled',
      cancel_at_period_end = true,
      updated_at = now()
  WHERE user_id = p_user_id
    AND status IN ('active', 'past_due', 'incomplete', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION activate_paid_premium(uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_paid_premium(uuid) FROM PUBLIC;
-- Appelées uniquement depuis les Edge Functions (service role)


-- ===== 20260812110000_ensure_signup_membership.sql =====

/*
  Garantit qu’une offre (Fondateur si places restantes, sinon freemium)
  est bien rattachée au profil avant de finaliser l’inscription.
*/

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

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = uid) THEN
    RETURN jsonb_build_object(
      'linked', false,
      'error', 'profile_required',
      'plan', null,
      'is_founder', false
    );
  END IF;

  SELECT * INTO m FROM memberships WHERE user_id = uid;
  IF NOT FOUND THEN
    m := try_claim_founder_slot(uid);
  END IF;

  -- Relecture défensive (si le claim a échoué silencieusement)
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

  -- Normalisation fondateur expiré
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

-- Expose un flag clair dans le statut lu par le client
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
    IF EXISTS (SELECT 1 FROM profiles WHERE id = uid) THEN
      m := try_claim_founder_slot(uid);
    ELSE
      price_cents := get_setting_int('premium_price_cents', 1999);
      RETURN jsonb_build_object(
        'membership_linked', false,
        'plan', 'free',
        'is_founder', false,
        'has_premium', false,
        'has_boost', false,
        'founders_remaining', get_setting_int('founder_max_slots', 500),
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


-- ===== 20260812114000_claim_signup_offer.sql =====

/*
  Choix d’offre explicite à l’inscription (avant même le profil).
  - founder : tente le slot Fondateur (sinon freemium si quota plein)
  - free    : rattache l’offre Freemium sans prendre un slot Fondateur
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

  -- Déjà rattaché : on renvoie l’existant (pas de double choix)
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
    -- Freemium explicite (ne consomme pas un slot Fondateur)
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

-- À la création du profil : ne plus forcer Fondateur.
-- Si l’utilisateur a déjà choisi une offre, on la conserve.
-- Sinon filet de sécurité = Freemium (jamais Fondateur sans choix explicite).
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

-- ensure_my_membership : vérifie le lien sans imposer Fondateur
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
      -- Filet : freemium uniquement (le Fondateur se choisit via claim_signup_offer)
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

-- Statut : si membership déjà choisie (même sans profil), la renvoyer.
-- Ne plus auto-attribuer Fondateur en lazy-claim.
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

-- ===== Fondateurs : droits Premium sauf Boost =====
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

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
