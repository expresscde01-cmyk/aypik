-- Tutoiement des notifications in-app restantes (boost, founder, premium).
-- Corrige le vouvoiement résiduel dans activate_paid_boost, process_founder_expirations,
-- purchase_boost, try_claim_founder_slot, activate_paid_premium.
-- Logique métier inchangée, uniquement le texte des notifications.

CREATE OR REPLACE FUNCTION public.activate_paid_boost(p_user_id uuid DEFAULT NULL::uuid, p_provider text DEFAULT 'stripe'::text, p_payment_ref text DEFAULT NULL::text)
 RETURNS profile_boosts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := COALESCE(p_user_id, auth.uid());
  result profile_boosts;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_provider IS NULL OR p_provider NOT IN ('stripe', 'paypal') THEN
    RAISE EXCEPTION 'invalid_provider';
  END IF;

  UPDATE profile_boosts
  SET ends_at = GREATEST(ends_at, now()) + interval '24 hours',
      payment_status = 'paid',
      amount_cents = 299
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
      'Ton profil reste mis en avant pour 24 heures supplémentaires (paiement confirmé).'
    );
    RETURN result;
  END IF;

  INSERT INTO profile_boosts (user_id, starts_at, ends_at, payment_status, amount_cents)
  VALUES (uid, now(), now() + interval '24 hours', 'paid', 299)
  RETURNING * INTO result;

  INSERT INTO membership_notifications (user_id, kind, title, body)
  VALUES (
    uid,
    'boost_activated',
    'Boost activé',
    'Ton profil est mis en avant pendant 24 heures (paiement confirmé).'
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_founder_expirations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'Ta période Fondateur touche à sa fin',
    'Dans quelques jours, tes avantages Fondateur (likes illimités, coup de cœur, boost) prendront fin. Ton titre de Membre Fondateur et ton numéro restent visibles.'
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
    'Membre Fondateur — titre honorifique',
    'Tes 6 mois d''avantages sont terminés. Ton badge Membre Fondateur et ton numéro restent visibles. Les likes illimités, le coup de cœur et le boost offert ne sont plus actifs.'
  FROM expired;

  GET DIAGNOSTICS n_expired = ROW_COUNT;

  RETURN n_warned + n_expired;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_boost()
 RETURNS profile_boosts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'Ton profil reste mis en avant pour 24 heures supplémentaires.'
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
    'Ton profil est mis en avant pendant 24 heures.'
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.try_claim_founder_slot(p_user_id uuid)
 RETURNS memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'Tu fais partie des 500 premiers. Likes illimités, coup de cœur et boost profil offert le 1er mois, avec ton badge distinctif à vie.'
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.activate_paid_premium(p_user_id uuid, p_provider text, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('aypik.allow_paid_meta', '1', true);

  INSERT INTO public.memberships (
    user_id,
    plan,
    premium_until,
    payment_provider,
    paid_premium_started_at
  )
  VALUES (
    p_user_id,
    'premium',
    COALESCE(p_period_end, now() + interval '1 month'),
    p_provider,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan = 'premium',
    premium_until = COALESCE(p_period_end, now() + interval '1 month'),
    payment_provider = p_provider,
    paid_premium_started_at = COALESCE(
      public.memberships.paid_premium_started_at,
      now()
    ),
    updated_at = now();

  INSERT INTO public.membership_notifications (user_id, kind, title, body)
  VALUES (
    p_user_id,
    'premium_activated',
    'Premium actif',
    'Merci pour ton soutien. Ton abonnement Premium est actif. Tu peux le résilier à tout moment en un clic depuis ton profil.'
  );
END;
$function$;

UPDATE membership_notifications
SET body = 'Ton profil reste mis en avant pour 24 heures supplémentaires (paiement confirmé).'
WHERE body = 'Votre profil reste mis en avant pour 24 heures supplémentaires (paiement confirmé).';

UPDATE membership_notifications
SET body = 'Ton profil est mis en avant pendant 24 heures (paiement confirmé).'
WHERE body = 'Votre profil est mis en avant pendant 24 heures (paiement confirmé).';

UPDATE membership_notifications
SET body = 'Ton profil reste mis en avant pour 24 heures supplémentaires.'
WHERE body = 'Votre profil reste mis en avant pour 24 heures supplémentaires.';

UPDATE membership_notifications
SET body = 'Ton profil est mis en avant pendant 24 heures.'
WHERE body = 'Votre profil est mis en avant pendant 24 heures.';

UPDATE membership_notifications
SET title = 'Ta période Fondateur touche à sa fin',
    body = 'Dans quelques jours, tes avantages Fondateur (likes illimités, coup de cœur, boost) prendront fin. Ton titre de Membre Fondateur et ton numéro restent visibles.'
WHERE title = 'Votre période Fondateur touche à sa fin';

UPDATE membership_notifications
SET body = 'Tes 6 mois d''avantages sont terminés. Ton badge Membre Fondateur et ton numéro restent visibles. Les likes illimités, le coup de cœur et le boost offert ne sont plus actifs.'
WHERE body = 'Vos 6 mois d''avantages sont terminés. Votre badge Membre Fondateur et votre numéro restent visibles. Les likes illimités, le coup de cœur et le boost offert ne sont plus actifs.';

UPDATE membership_notifications
SET body = 'Tu fais partie des 500 premiers. Likes illimités, coup de cœur et boost profil offert le 1er mois, avec ton badge distinctif à vie.'
WHERE body = 'Vous faites partie des 500 premiers. Likes illimités, coup de cœur et boost profil offert le 1er mois, avec votre badge distinctif à vie.';

UPDATE membership_notifications
SET title = 'Premium actif',
    body = 'Merci pour ton soutien. Ton abonnement Premium est actif. Tu peux le résilier à tout moment en un clic depuis ton profil.'
WHERE title = 'Premium active';

NOTIFY pgrst, 'reload schema';