BEGIN;

-- Plafond = 1000 numéros attribués, pas les comptes encore présents.
-- Un numéro supprimé est perdu. Jamais réattribué, jamais au-delà de 1000.
-- La phase de lancement se termine à l'attribution du 1000e numéro.

COMMENT ON COLUMN public.memberships.founder_number IS
  'Numéro attribué une seule fois, de 1 à 1000. Perdu définitivement à la suppression du compte.';

CREATE OR REPLACE FUNCTION public.try_claim_founder_slot(p_user_id uuid)
RETURNS memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  max_slots integer;
  months integer;
  issued integer;
  next_number integer;
  result memberships;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO result FROM memberships WHERE user_id = p_user_id;
  IF FOUND THEN
    IF result.is_founder OR result.plan = 'founder' THEN
      PERFORM grant_founder_first_month_boost(p_user_id);
    END IF;
    RETURN result;
  END IF;

  max_slots := get_setting_int('founder_max_slots', 1000);
  months := get_setting_int('founder_premium_months', 6);

  PERFORM pg_advisory_xact_lock(872014);

  SELECT count(*)::integer INTO issued FROM public.founder_numbers_issued;

  IF issued >= max_slots THEN
    INSERT INTO memberships (user_id, plan, is_founder)
    VALUES (p_user_id, 'free', false)
    RETURNING * INTO result;
    RETURN result;
  END IF;

  SELECT COALESCE(MAX(founder_number), 0) + 1
  INTO next_number
  FROM public.founder_numbers_issued;

  IF next_number > max_slots THEN
    INSERT INTO memberships (user_id, plan, is_founder)
    VALUES (p_user_id, 'free', false)
    RETURNING * INTO result;
    RETURN result;
  END IF;

  INSERT INTO public.founder_numbers_issued (founder_number)
  VALUES (next_number);

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
    'Tu fais partie des 1000 premiers Membres Fondateurs (numéro '
      || next_number::text
      || '). Likes illimités, coup de cœur et boost profil offert le 1er mois, avec ton badge distinctif tant que ton compte reste actif.'
  );

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.try_claim_founder_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_claim_founder_slot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_membership_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  m public.memberships%rowtype;
  membership_found boolean;
  founders_count integer;
  max_slots integer;
  like_limit integer;
  likes_today integer;
  boost_ends timestamptz;
  premium boolean;
  founder_entitled boolean;
  boosted boolean;
  price_cents integer;
  confort_cents integer;
  essentiel_cents integer;
  basique_cents integer;
  vis_cents integer;
  franco_cents integer;
  intl_cents integer;
  currency text;
  interval_label text;
  founder_trial_cents integer;
  founder_months integer;
  on_founder_trial boolean;
  effective_price_cents integer;
  can_filter boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO m FROM public.memberships WHERE user_id = uid;
  membership_found := FOUND;
  price_cents := get_setting_int('premium_price_cents', 2499);
  confort_cents := get_setting_int('confort_price_cents', 1999);
  essentiel_cents := get_setting_int('essentiel_price_cents', 1499);
  basique_cents := get_setting_int('basique_price_cents', 999);
  vis_cents := get_setting_int('visibilite_price_cents', 299);
  franco_cents := get_setting_int('francophone_price_cents', 299);
  intl_cents := get_setting_int('international_price_cents', 599);
  currency := get_setting_text('premium_currency', 'EUR');
  interval_label := get_setting_text('premium_interval', 'month');
  founder_trial_cents := get_setting_int('founder_trial_price_cents', 0);
  founder_months := get_setting_int('founder_premium_months', 6);
  SELECT count(*)::integer INTO founders_count FROM public.founder_numbers_issued;
  max_slots := get_setting_int('founder_max_slots', 1000);

  IF NOT membership_found THEN
    like_limit := 5;
    RETURN jsonb_build_object(
      'membership_linked', false,
      'plan', 'free',
      'is_founder', false,
      'has_premium', false,
      'has_boost', false,
      'founders_remaining', greatest(max_slots - founders_count, 0),
      'founders_taken', founders_count,
      'founders_max', max_slots,
      'premium_price_cents', price_cents,
      'confort_price_cents', confort_cents,
      'essentiel_price_cents', essentiel_cents,
      'basique_price_cents', basique_cents,
      'visibilite_price_cents', vis_cents,
      'francophone_price_cents', franco_cents,
      'international_price_cents', intl_cents,
      'premium_currency', currency,
      'premium_interval', interval_label,
      'founder_trial_price_cents', founder_trial_cents,
      'founder_premium_months', founder_months,
      'on_founder_trial', false,
      'effective_price_cents', price_cents,
      'unlimited_likes', false,
      'free_daily_likes', like_limit,
      'likes_used_today', 0,
      'likes_remaining_today', like_limit,
      'can_see_who_liked', false,
      'can_use_advanced_filters', false,
      'has_visibility_access', false,
      'has_francophone_access', false,
      'has_international_access', false,
      'visibilite_until', null,
      'francophone_until', null,
      'international_until', null
    ) || public._account_access_phase(uid);
  END IF;

  IF m.is_founder
     AND m.plan = 'founder'
     AND m.founder_premium_until IS NOT NULL
     AND m.founder_premium_until <= now() THEN
    UPDATE public.memberships
    SET plan = 'free', updated_at = now()
    WHERE user_id = uid;
    m.plan := 'free';
  END IF;

  founder_entitled := public.offer_founder_window(uid);
  premium := public.has_active_premium(uid);
  boosted := public.has_active_boost(uid);
  on_founder_trial := founder_entitled;
  like_limit := public.offer_daily_like_limit(uid);
  can_filter := public.offer_can_personalize_search(uid);
  effective_price_cents := CASE
    WHEN on_founder_trial THEN founder_trial_cents
    ELSE price_cents
  END;

  SELECT count(*)::integer INTO likes_today
  FROM public.likes
  WHERE from_user = uid
    AND created_at >= date_trunc('day', now());

  SELECT max(ends_at) INTO boost_ends
  FROM public.profile_boosts
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
    'founders_remaining', greatest(max_slots - founders_count, 0),
    'free_daily_likes', coalesce(like_limit, 0),
    'likes_used_today', likes_today,
    'likes_remaining_today', CASE
      WHEN like_limit IS NULL THEN NULL
      ELSE greatest(like_limit - likes_today, 0)
    END,
    'can_see_who_liked', premium,
    'can_use_advanced_filters', can_filter,
    'unlimited_likes', premium,
    'premium_price_cents', price_cents,
    'confort_price_cents', confort_cents,
    'essentiel_price_cents', essentiel_cents,
    'basique_price_cents', basique_cents,
    'visibilite_price_cents', vis_cents,
    'francophone_price_cents', franco_cents,
    'international_price_cents', intl_cents,
    'premium_currency', currency,
    'premium_interval', interval_label,
    'founder_trial_price_cents', founder_trial_cents,
    'founder_premium_months', founder_months,
    'on_founder_trial', on_founder_trial,
    'effective_price_cents', effective_price_cents,
    'has_visibility_access', public.offer_has_visibility_access(uid),
    'has_francophone_access', public.offer_has_francophone_access(uid),
    'has_international_access', public.offer_has_international_access(uid),
    'visibilite_until', m.visibilite_until,
    'francophone_until', m.francophone_until,
    'international_until', m.international_until
  ) || public._account_access_phase(uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_founder_slot_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  taken integer;
  max_slots integer;
  remaining integer;
BEGIN
  max_slots := GREATEST(1, get_setting_int('founder_max_slots', 1000));
  SELECT count(*)::integer INTO taken FROM public.founder_numbers_issued;
  remaining := GREATEST(0, max_slots - taken);
  RETURN jsonb_build_object(
    'founders_taken', taken,
    'founders_max', max_slots,
    'founders_remaining', remaining,
    'founder_offer_closed', remaining <= 0
  );
END;
$$;

COMMENT ON FUNCTION public.get_founder_slot_status() IS
  'Compteur des numéros Fondateur attribués (1 à 1000). La phase de lancement se termine au 1000e numéro.';

NOTIFY pgrst, 'reload schema';

COMMIT;
