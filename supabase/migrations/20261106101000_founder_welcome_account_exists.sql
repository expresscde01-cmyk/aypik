-- Notification de bienvenue Fondateur : le compte existe tant qu'il n'est pas
-- supprimé, et les 2 Boosts se comptent depuis leur crédit.
-- Ce fichier ne s'applique pas tout seul. La production attend un
-- `supabase db push` séparé. `npm run deploy` ne touche pas la base.

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
  v_boosts_ready boolean := false;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO result FROM memberships WHERE user_id = p_user_id;
  IF FOUND THEN
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
    RETURNING * INTO result;
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
