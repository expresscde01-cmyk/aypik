-- Statut Fondateur indélébile (1–500). Après founder_premium_until : titre honorifique,
-- plus aucun privilège (likes, flash, boost offert, has_premium / on_founder_trial).

INSERT INTO platform_settings (key, value) VALUES
  ('founder_max_slots', '500'::jsonb)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

COMMENT ON COLUMN memberships.is_founder IS
  'Tant que la ligne existe : une fois true, jamais remis à false par UPDATE. Effacé avec le compte (DELETE / CASCADE).';
COMMENT ON COLUMN memberships.founder_number IS
  'Numéro unique jamais réattribué. Effacé avec le compte ; le prochain claim prend MAX+1 (pas les trous).';

-- Empêche toute UPDATE de retirer le titre ou le numéro. DELETE (RGPD) autorisé.
CREATE OR REPLACE FUNCTION protect_founder_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF OLD.is_founder IS TRUE THEN
    NEW.is_founder := true;
  END IF;
  IF OLD.founder_number IS NOT NULL THEN
    NEW.founder_number := OLD.founder_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memberships_protect_founder_identity ON memberships;
CREATE TRIGGER memberships_protect_founder_identity
BEFORE UPDATE ON memberships
FOR EACH ROW
EXECUTE FUNCTION protect_founder_identity();

CREATE OR REPLACE FUNCTION is_founder_window_active(p_user_id uuid)
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
  RETURN COALESCE(m.is_founder, false)
    AND m.founder_premium_until IS NOT NULL
    AND m.founder_premium_until > now();
END;
$$;

REVOKE ALL ON FUNCTION is_founder_window_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_founder_window_active(uuid) TO authenticated;

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

  -- Privilèges fondateur uniquement pendant la fenêtre de 6 mois.
  IF COALESCE(m.is_founder, false)
     AND m.founder_premium_until IS NOT NULL
     AND m.founder_premium_until > now() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

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
  IF NOT (
    COALESCE(m.is_founder, false)
    AND m.founder_premium_until IS NOT NULL
    AND m.founder_premium_until > now()
  ) THEN
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

CREATE SEQUENCE IF NOT EXISTS public.founder_number_seq
  AS integer
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

DO $$
DECLARE
  mx integer;
  seq_last bigint;
  seq_called boolean;
  current_next bigint;
  needed_next bigint;
BEGIN
  SELECT COALESCE(MAX(founder_number), 0) INTO mx FROM public.memberships;
  needed_next := mx + 1;
  SELECT last_value, is_called INTO seq_last, seq_called
  FROM public.founder_number_seq;
  current_next := CASE WHEN seq_called THEN seq_last + 1 ELSE seq_last END;
  IF current_next < needed_next THEN
    PERFORM setval('public.founder_number_seq', needed_next, false);
  END IF;
END $$;

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

  max_slots := get_setting_int('founder_max_slots', 500);
  months := get_setting_int('founder_premium_months', 6);

  PERFORM pg_advisory_xact_lock(872014);

  IF count_founders() >= max_slots THEN
    INSERT INTO memberships (user_id, plan, is_founder)
    VALUES (p_user_id, 'free', false)
    RETURNING * INTO result;
    RETURN result;
  END IF;

  SELECT COALESCE(MAX(founder_number), 0) INTO next_number FROM memberships;
  next_number := GREATEST(nextval('public.founder_number_seq'), next_number + 1);
  PERFORM setval('public.founder_number_seq', next_number, true);

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
    'Vous faites partie des 500 premiers. Likes illimités, coup de cœur et boost profil offert le 1er mois, avec votre badge distinctif à vie.'
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION try_claim_founder_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION try_claim_founder_slot(uuid) TO authenticated;

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
    'Dans quelques jours, vos avantages Fondateur (likes illimités, coup de cœur, boost) prendront fin. Votre titre de Membre Fondateur et votre numéro restent visibles.'
  FROM due;

  GET DIAGNOSTICS n_warned = ROW_COUNT;

  -- Expiration : plan = free uniquement. is_founder et founder_number restent.
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
    'Membre Fondateur — titre honorifique',
    'Vos 6 mois d’avantages sont terminés. Votre badge Membre Fondateur et votre numéro restent visibles. Les likes illimités, le coup de cœur et le boost offert ne sont plus actifs.'
  FROM expired;

  GET DIAGNOSTICS n_expired = ROW_COUNT;

  RETURN n_warned + n_expired;
END;
$$;

REVOKE ALL ON FUNCTION process_founder_expirations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_founder_expirations() TO authenticated;

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

  -- Fenêtre écoulée : plan free, titre conservé (trigger + pas de SET is_founder).
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
    COALESCE(m.is_founder, false)
    AND m.founder_premium_until IS NOT NULL
    AND m.founder_premium_until > now();

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

CREATE OR REPLACE FUNCTION send_flash(p_to_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  existing flashes%ROWTYPE;
  inserted flashes%ROWTYPE;
  actor_name text;
  target_exists boolean;
  m memberships%ROWTYPE;
  founder_window boolean := false;
  unlimited_flash boolean := false;
  free_limit integer;
  used_today integer := 0;
  notif_id uuid;
  my_birth date;
  their_birth date;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_to_user IS NULL OR p_to_user = me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_to_user AND has_children = false
  ) INTO target_exists;

  IF NOT target_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  SELECT birth_date INTO my_birth FROM profiles WHERE id = me;
  SELECT birth_date INTO their_birth FROM profiles WHERE id = p_to_user;

  IF my_birth IS NULL OR their_birth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF NOT public.dating_partner_old_enough(my_birth, their_birth) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'age_rule_violation');
  END IF;

  SELECT * INTO m FROM memberships WHERE user_id = me;
  founder_window :=
    FOUND
    AND COALESCE(m.is_founder, false)
    AND m.founder_premium_until IS NOT NULL
    AND m.founder_premium_until > now();

  -- Lancement : flash réservé à la fenêtre Fondateur (6 mois), pas au seul titre.
  IF get_setting_int('payments_enabled', 0) = 0 AND NOT founder_window THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'flash_reserved_for_founders'
    );
  END IF;

  unlimited_flash :=
    founder_window
    OR (
      m.plan = 'premium'
      AND (m.premium_until IS NULL OR m.premium_until > now())
    )
    OR has_active_premium(me);

  SELECT * INTO existing
  FROM flashes
  WHERE from_user = me AND to_user = p_to_user;

  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_flashed', true,
      'flash_id', existing.id,
      'to_user', p_to_user
    );
  END IF;

  free_limit := get_setting_int('free_daily_flashes', 3);

  IF NOT unlimited_flash THEN
    SELECT COUNT(*)::integer INTO used_today
    FROM flashes
    WHERE from_user = me
      AND created_at >= date_trunc('day', now());

    IF used_today >= free_limit THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'flash_quota_exhausted',
        'flashes_remaining_today', 0,
        'free_daily_flashes', free_limit
      );
    END IF;
  END IF;

  INSERT INTO flashes (from_user, to_user)
  VALUES (me, p_to_user)
  RETURNING * INTO inserted;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO actor_name
  FROM profiles
  WHERE id = me;

  INSERT INTO social_notifications (
    user_id, kind, title, body, actor_id, flash_id
  ) VALUES (
    p_to_user,
    'flash_received',
    'Nouveau coup de cœur',
    actor_name || ' vous a envoyé un coup de cœur ✨',
    me,
    inserted.id
  )
  RETURNING id INTO notif_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_flashed', false,
    'flash_id', inserted.id,
    'notification_id', notif_id,
    'to_user', p_to_user,
    'from_display_name', actor_name,
    'should_notify_email', true,
    'flashes_remaining_today', CASE
      WHEN unlimited_flash THEN NULL
      ELSE GREATEST(free_limit - used_today - 1, 0)
    END,
    'free_daily_flashes', free_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION send_flash(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION send_flash(uuid) TO authenticated;

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

  IF get_setting_int('payments_enabled', 0) = 0 THEN
    RAISE EXCEPTION 'payments_disabled';
  END IF;

  -- Pendant la fenêtre Fondateur le boost est offert le 1er mois, pas acheté.
  IF is_founder_window_active(uid) THEN
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

REVOKE ALL ON FUNCTION cancel_paid_premium(uuid) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
