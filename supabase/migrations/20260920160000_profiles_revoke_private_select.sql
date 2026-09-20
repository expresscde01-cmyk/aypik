-- Minimisation profiles (étape 3) — À N’APPLIQUER QU’APRÈS
-- 1) migration A (20260920150000) collée
-- 2) zip front déployé et testé (inscription, Mon profil, Accueil, Découvrir, Mes Matchs)
--
-- Un REVOKE SELECT (colonnes) est inopérant si authenticated a encore
-- GRANT SELECT au niveau de la TABLE (ou ALL). On retire donc le SELECT table,
-- puis on ré-accorde uniquement les 16 colonnes publiques.

REVOKE SELECT ON TABLE public.profiles FROM PUBLIC;
REVOKE SELECT ON TABLE public.profiles FROM anon;
REVOKE SELECT ON TABLE public.profiles FROM authenticated;

REVOKE SELECT (
  lat,
  lng,
  birth_date,
  deletion_requested_at,
  paused_at,
  deactivated_at,
  incognito_at,
  last_active_at,
  email_notifications_enabled,
  preferred_locale,
  testimonial_consent,
  testimonial_consent_at,
  testimonial_consent_withdrawn_at
) ON public.profiles FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  display_name,
  bio,
  has_children,
  location,
  interests,
  photo_url,
  gender,
  country_code,
  city_name,
  geoname_id,
  discover_mode,
  temperament,
  languages,
  created_at,
  updated_at
) ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Vérification attendue : exactement ces 16 colonnes
-- SELECT string_agg(column_name, ', ' ORDER BY column_name)
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public'
--   AND table_name = 'profiles'
--   AND privilege_type = 'SELECT'
--   AND grantee = 'authenticated';

-- Retour arrière (rétablir les 13 colonnes privées, sans SELECT table) :
-- GRANT SELECT (
--   lat, lng, birth_date, deletion_requested_at, paused_at, deactivated_at,
--   incognito_at, last_active_at, email_notifications_enabled, preferred_locale,
--   testimonial_consent, testimonial_consent_at, testimonial_consent_withdrawn_at
-- ) ON public.profiles TO authenticated;
-- NOTIFY pgrst, 'reload schema';
