
-- Faille : try_claim_founder_slot(p_user_id) n'avait AUCUNE vérification d'identité
-- (ni auth.uid(), ni comparaison à p_user_id) et était exécutable même par anon.
-- N'importe qui pouvait attribuer une place Fondateur (parmi 500, numéros jamais
-- réattribués) à n'importe quel user_id, y compris sans profil complété.
-- Corrigé sur le même modèle que cancel_paid_premium (qui a déjà cette protection).
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

-- Tâches de maintenance globale (expiration en masse des avantages Fondateur,
-- suppression définitive des comptes après le délai RGPD) : aucune raison d'être
-- appelables par le public, y compris anon. Uniquement service_role (cron / edge
-- functions internes).
REVOKE EXECUTE ON FUNCTION public.process_founder_expirations() FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_founder_expirations() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_expired_deletions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_expired_deletions() FROM authenticated;

NOTIFY pgrst, 'reload schema';
