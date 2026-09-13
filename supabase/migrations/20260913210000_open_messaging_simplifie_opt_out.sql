-- §3.3 : un profil protégé (Confort, Premium, Fondateur en fenêtre 6 mois)
-- peut se rendre joignable sans Match via discover_mode = 'simplifie'.
-- Effet en réception seulement. Gratuit / Basique / Essentiel restent ouverts.
-- Ne pas toucher à RETURNS TABLE de suggest_profiles : open_messaging
-- appelle déjà is_open_messaging_profile.

CREATE OR REPLACE FUNCTION public.is_open_messaging_profile(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  m public.memberships%ROWTYPE;
  v_plan text;
  v_founder_protected boolean;
  v_mode text;
BEGIN
  SELECT * INTO m FROM public.memberships WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  v_plan := COALESCE(m.plan, 'free');
  v_founder_protected :=
    COALESCE(m.is_founder, false)
    AND m.founder_premium_until IS NOT NULL
    AND m.founder_premium_until > now();

  IF v_plan IN ('confort', 'premium') OR v_founder_protected THEN
    SELECT p.discover_mode INTO v_mode
    FROM public.profiles p
    WHERE p.id = p_user_id;
    RETURN COALESCE(v_mode, 'detaille') = 'simplifie';
  END IF;

  -- Gratuit, Basique, Essentiel, et Fondateur hors fenêtre (badge honorifique).
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.is_open_messaging_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_open_messaging_profile(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_open_messaging_profile(uuid) IS
  'Destinataire joignable sans Match : Gratuit/Basique/Essentiel, ou profil protégé (Confort/Premium/Fondateur en fenêtre) ayant choisi discover_mode = simplifie. Aucun passe-droit pour écrire aux autres profils protégés.';

COMMENT ON COLUMN public.profiles.discover_mode IS
  'detaille / simplifie. Mes Matchs : densité du parcours. Messagerie : si le compte est protégé (Confort, Premium, Fondateur en fenêtre), simplifie le rend joignable sans Match en réception uniquement.';
