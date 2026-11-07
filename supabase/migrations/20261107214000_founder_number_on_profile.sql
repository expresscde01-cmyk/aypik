-- Le numéro Fondateur est attribué au premier enregistrement du profil,
-- pas à l'ouverture du compte. Cette migration ne réécrit aucun compte existant.
-- Tant qu'il reste une place, l'offre gratuite ne peut pas être choisie.
-- À 1000 numéros émis, le profil est créé en offre gratuite, sans erreur.

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
  boosted memberships;
  v_has_row boolean := false;
  v_has_profile boolean := false;
  v_boosts_ready boolean := false;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO result FROM memberships WHERE user_id = p_user_id;
  v_has_row := FOUND;
  IF v_has_row AND (
    result.is_founder
    OR result.founder_number IS NOT NULL
    OR result.plan = 'founder'
  ) THEN
    RETURN result;
  END IF;

  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id)
    INTO v_has_profile;

  -- Numero au profil : sans profil, aucune place n'est consommée.
  IF NOT v_has_profile THEN
    IF v_has_row THEN
      RETURN result;
    END IF;
    RETURN NULL;
  END IF;

  max_slots := get_setting_int('founder_max_slots', 1000);
  months := get_setting_int('founder_premium_months', 6);

  PERFORM pg_advisory_xact_lock(872014);

  SELECT * INTO result FROM memberships WHERE user_id = p_user_id;
  v_has_row := FOUND;
  IF v_has_row AND (
    result.is_founder
    OR result.founder_number IS NOT NULL
    OR result.plan = 'founder'
  ) THEN
    RETURN result;
  END IF;

  SELECT count(*)::integer INTO issued FROM public.founder_numbers_issued;

  SELECT COALESCE(MAX(founder_number), 0) + 1
    INTO next_number
  FROM public.founder_numbers_issued;

  IF issued >= max_slots OR next_number > max_slots THEN
    IF NOT v_has_row THEN
      INSERT INTO memberships (user_id, plan, is_founder)
      VALUES (p_user_id, 'free', false)
      RETURNING * INTO result;
    END IF;
    RETURN result;
  END IF;

  INSERT INTO public.founder_numbers_issued (founder_number)
  VALUES (next_number);

  IF v_has_row THEN
    -- Ligne gratuite existante : poser le numéro sans en créer une deuxième.
    UPDATE public.memberships
    SET plan = 'founder',
        is_founder = true,
        founder_number = next_number,
        founder_premium_until = now() + make_interval(months => months),
        updated_at = now()
    WHERE user_id = p_user_id
      AND is_founder IS NOT TRUE
      AND founder_number IS NULL
      AND plan IS DISTINCT FROM 'founder'
    RETURNING * INTO result;

    IF NOT FOUND THEN
      DELETE FROM public.founder_numbers_issued
      WHERE founder_number = next_number;
      SELECT * INTO result FROM memberships WHERE user_id = p_user_id;
      RETURN result;
    END IF;
  ELSE
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
  END IF;

  v_boosts_ready := EXISTS (
    SELECT 1
    FROM public.platform_settings
    WHERE key = 'founder_boosts_credited_at'
  );

  IF v_boosts_ready THEN
    UPDATE public.memberships
    SET founder_boosts_remaining = 2,
        founder_boosts_expire_at = now() + interval '6 months',
        updated_at = now()
    WHERE user_id = p_user_id
      AND founder_boosts_remaining = 0
      AND founder_boosts_expire_at IS NULL
    RETURNING * INTO boosted;
    IF FOUND THEN
      result := boosted;
    END IF;
  END IF;

  INSERT INTO membership_notifications (user_id, kind, title, body)
  VALUES (
    p_user_id,
    'founder_welcome',
    'Bienvenue, Membre Fondateur',
    CASE
      WHEN v_boosts_ready THEN
        'Tu fais partie des 1000 premiers Membres Fondateurs (numéro '
          || next_number::text
          || '). Likes illimités et coup de cœur, avec ton badge distinctif tant que ton compte existe. Tu as 2 Boosts de 24 h, crédités au lancement des offres payantes, à utiliser dans les 6 mois qui suivent ce crédit.'
      ELSE
        'Tu fais partie des 1000 premiers Membres Fondateurs (numéro '
          || next_number::text
          || '). Likes illimités et coup de cœur, avec ton badge distinctif tant que ton compte existe. Tu recevras 2 Boosts de 24 h au lancement des offres payantes, à utiliser dans les 6 mois qui suivent ce crédit.'
    END
  );

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.try_claim_founder_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_claim_founder_slot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.on_profile_created_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $profile$
BEGIN
  -- Le parcours actuel ne crée pas de ligne avant le profil tant qu'il
  -- reste des places. Une ligne peut pourtant déjà exister : compte qui
  -- avait choisi l'offre gratuite avant ce changement, ou ligne gratuite
  -- posée une fois les places prises. Dans les deux cas, le compte
  -- connecté passe par try_claim_founder_slot. Sans place, la ligne
  -- gratuite est conservée, sans erreur.
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.id THEN
    PERFORM public.try_claim_founder_slot(NEW.id);
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.memberships WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.memberships (user_id, plan, is_founder)
  VALUES (NEW.id, 'free', false)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$profile$;

CREATE OR REPLACE FUNCTION public.claim_signup_offer(p_offer text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $claim$
DECLARE
  uid uuid := auth.uid();
  m memberships%ROWTYPE;
  offer text := lower(trim(p_offer));
  issued integer;
  max_slots integer;
  spots_open boolean;
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

  SELECT count(*)::integer INTO issued FROM public.founder_numbers_issued;
  max_slots := get_setting_int('founder_max_slots', 1000);
  spots_open := issued < max_slots;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = uid) THEN
    IF offer = 'free' AND NOT spots_open THEN
      INSERT INTO memberships (user_id, plan, is_founder)
      VALUES (uid, 'free', false)
      RETURNING * INTO m;
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
    END IF;

    RETURN jsonb_build_object(
      'linked', false,
      'error', null,
      'plan', null,
      'is_founder', false,
      'founder_number', null,
      'awaiting_profile', true
    );
  END IF;

  m := public.try_claim_founder_slot(uid);

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
$claim$;

REVOKE ALL ON FUNCTION public.claim_signup_offer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_signup_offer(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_my_membership()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $ensure$
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
      m := public.try_claim_founder_slot(uid);
      IF m.user_id IS NULL THEN
        SELECT * INTO m FROM memberships WHERE user_id = uid;
      END IF;
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
$ensure$;

REVOKE ALL ON FUNCTION public.ensure_my_membership() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_membership() TO authenticated;

NOTIFY pgrst, 'reload schema';
