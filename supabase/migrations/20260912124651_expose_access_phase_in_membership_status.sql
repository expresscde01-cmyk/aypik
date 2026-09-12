-- Expose la phase d'accès (founder_full / trial_full / trial_simplified /
-- post_trial) calculée par _account_access_phase() dans le statut renvoyé
-- au frontend, pour piloter le grisage des éléments UI et l'affichage des
-- CGV / moyens de paiement (payment_visible) une fois le modèle payant
-- branché côté interface. Aucun changement de comportement pour l'instant :
-- ce sont des champs supplémentaires en lecture, rien n'est encore consommé
-- côté client.
CREATE OR REPLACE FUNCTION public.get_my_membership_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    ) || public._account_access_phase(uid);
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
  ) || public._account_access_phase(uid);
END;
$function$;
