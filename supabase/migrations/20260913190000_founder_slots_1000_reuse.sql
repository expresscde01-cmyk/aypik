-- Quota Fondateur : 1000 places actives. Une place se libère uniquement à la
-- suppression du compte (pas par inactivité). Le numéro le plus bas disponible
-- dans 1..max_slots est réattribué au prochain inscrit.
--
-- Reliquat : activate_paid_addon(uuid, text, text, timestamptz) — les webhooks
-- n’appellent que (uuid, text, timestamptz).

INSERT INTO public.platform_settings (key, value)
VALUES ('founder_max_slots', '1000'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();

COMMENT ON COLUMN public.memberships.founder_number IS
  'Numéro 1..founder_max_slots. Unique parmi les comptes actifs. Libéré et réutilisable uniquement après DELETE du compte (CASCADE). L’inactivité ne libère pas la place.';

COMMENT ON COLUMN public.memberships.is_founder IS
  'Tant que la ligne existe : une fois true, jamais remis à false par UPDATE. Effacé avec le compte (DELETE / CASCADE). L’inactivité ne retire pas le statut.';

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

  max_slots := get_setting_int('founder_max_slots', 1000);
  months := get_setting_int('founder_premium_months', 6);

  PERFORM pg_advisory_xact_lock(872014);

  IF count_founders() >= max_slots THEN
    INSERT INTO memberships (user_id, plan, is_founder)
    VALUES (p_user_id, 'free', false)
    RETURNING * INTO result;
    RETURN result;
  END IF;

  SELECT s.n INTO next_number
  FROM generate_series(1, max_slots) AS s(n)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.founder_number = s.n
  )
  ORDER BY s.n
  LIMIT 1;

  IF next_number IS NULL THEN
    INSERT INTO memberships (user_id, plan, is_founder)
    VALUES (p_user_id, 'free', false)
    RETURNING * INTO result;
    RETURN result;
  END IF;

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
    'Tu fais partie des Membres Fondateurs (' || max_slots::text
      || ' places). Likes illimités, coup de cœur et boost profil offert le 1er mois, avec ton badge distinctif tant que ton compte reste actif.'
  );

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.try_claim_founder_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_claim_founder_slot(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.activate_paid_addon(uuid, text, text, timestamptz);

NOTIFY pgrst, 'reload schema';
