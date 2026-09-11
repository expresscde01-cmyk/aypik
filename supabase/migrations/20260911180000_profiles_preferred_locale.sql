-- Langue d’interface persistée sur le profil (fr défaut).
-- SELECT colonne : le GRANT profiles est un snapshot ; on ré-accorde la nouvelle colonne.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_locale text NOT NULL DEFAULT 'fr';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_locale_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_locale_check
  CHECK (preferred_locale IN ('fr', 'en', 'es'));

COMMENT ON COLUMN public.profiles.preferred_locale IS
  'Langue d’interface (fr, en, es). Liée au compte actif ; effacée avec le profil (RGPD).';

GRANT SELECT, UPDATE (preferred_locale) ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
