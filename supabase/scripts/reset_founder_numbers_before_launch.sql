-- Remise à zéro manuelle, avant le lancement public.
-- À lancer dans l'éditeur SQL une fois les comptes de test supprimés.
-- N'est pas une migration : ne s'exécute pas avec db push.
-- Refuse de vider la trace s'il reste un Fondateur actif.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE is_founder OR founder_number IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'founder_reset_blocked: il reste un compte Fondateur';
  END IF;

  DELETE FROM public.founder_numbers_issued;
END $$;
