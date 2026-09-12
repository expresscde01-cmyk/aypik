-- GRANT colonne (snapshot profiles) : SELECT + UPDATE sur preferred_locale.
-- La migration 20260911180000 utilisait GRANT SELECT, UPDATE (preferred_locale)
-- = SELECT table entière + UPDATE colonne, pas SELECT (preferred_locale).
-- Idempotent si la 1re n’est pas encore en prod.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_locale text NOT NULL DEFAULT 'fr';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_locale_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_locale_check
  CHECK (preferred_locale IN ('fr', 'en', 'es'));

COMMENT ON COLUMN public.profiles.preferred_locale IS
  'Langue d’interface (fr, en, es). Liée au compte actif ; effacée avec le profil (RGPD).';

GRANT SELECT (preferred_locale), UPDATE (preferred_locale)
  ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
