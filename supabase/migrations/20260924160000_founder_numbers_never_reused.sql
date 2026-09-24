BEGIN;

-- Un numéro de Fondateur n'est jamais réattribué.
-- 1000 places actives : si une place se libère, le suivant reçoit
-- max(numéros déjà attribués) + 1, même au-delà de 1000.
-- La trace ne contient que le numéro, jamais d'user_id.

CREATE TABLE public.founder_numbers_issued (
  founder_number integer PRIMARY KEY
);

COMMENT ON TABLE public.founder_numbers_issued IS
  'Numéros de Fondateur déjà attribués. Conservés après suppression du compte. Aucun lien avec la personne.';

COMMENT ON COLUMN public.memberships.founder_number IS
  'Numéro attribué une seule fois. Unique parmi les comptes encore présents. Non réutilisé après DELETE.';

INSERT INTO public.founder_numbers_issued (founder_number)
SELECT m.founder_number
FROM public.memberships m
WHERE m.founder_number IS NOT NULL
ON CONFLICT (founder_number) DO NOTHING;

ALTER TABLE public.founder_numbers_issued ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.founder_numbers_issued FROM PUBLIC;
REVOKE ALL ON TABLE public.founder_numbers_issued FROM anon, authenticated;

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

  SELECT COALESCE(MAX(founder_number), 0) + 1
  INTO next_number
  FROM public.founder_numbers_issued;

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
    'Tu fais partie des Membres Fondateurs (' || max_slots::text
      || ' places). Likes illimités, coup de cœur et boost profil offert le 1er mois, avec ton badge distinctif tant que ton compte reste actif.'
  );

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.try_claim_founder_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_claim_founder_slot(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
