-- Couleur du prénom dans « Bonjour, {prénom} » (espace membre seulement).
-- NULL = couleur par défaut selon le genre déclaré.
-- Pas de GRANT SELECT : la colonne n’entre pas dans les 16 colonnes publiques.
-- Lecture : my_profile() (security definer, auth.uid()).
-- Écriture : UPDATE colonne + RLS profiles_update_own (auth.uid() = id).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS greeting_name_color text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_greeting_name_color_known;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_greeting_name_color_known
  CHECK (
    greeting_name_color IS NULL
    OR greeting_name_color IN (
      'ciel',
      'framboise',
      'lavande',
      'corail',
      'ocean',
      'nuit'
    )
  );

COMMENT ON COLUMN public.profiles.greeting_name_color IS
  'Couleur du prénom dans le bonjour de l’espace membre (ciel, framboise, lavande, corail, ocean, nuit). NULL = défaut selon le genre déclaré. Effacée avec le profil.';

GRANT UPDATE (greeting_name_color) ON public.profiles TO authenticated;

DROP FUNCTION IF EXISTS public.my_profile();

CREATE FUNCTION public.my_profile()
RETURNS TABLE (
  id uuid,
  display_name text,
  birth_date date,
  bio text,
  has_children boolean,
  location text,
  interests text[],
  photo_url text,
  gender text,
  lat double precision,
  lng double precision,
  deletion_requested_at timestamptz,
  country_code text,
  city_name text,
  geoname_id bigint,
  discover_mode text,
  email_notifications_enabled boolean,
  preferred_locale text,
  temperament text[],
  languages jsonb,
  greeting_name_color text,
  paused_at timestamptz,
  deactivated_at timestamptz,
  incognito_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  age integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.display_name,
    p.birth_date,
    p.bio,
    p.has_children,
    p.location,
    p.interests,
    p.photo_url,
    p.gender,
    p.lat,
    p.lng,
    p.deletion_requested_at,
    p.country_code,
    p.city_name,
    p.geoname_id,
    p.discover_mode,
    p.email_notifications_enabled,
    p.preferred_locale,
    p.temperament,
    p.languages,
    p.greeting_name_color,
    p.paused_at,
    p.deactivated_at,
    p.incognito_at,
    p.created_at,
    p.updated_at,
    public.profile_age(p.birth_date)
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION public.my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_profile() TO service_role;
REVOKE EXECUTE ON FUNCTION public.my_profile() FROM anon;

COMMENT ON FUNCTION public.my_profile() IS
  'Profil du compte connecté uniquement (auth.uid()). Colonnes privées : birth_date, lat/lng, flags compte, e-mail, locale, couleur du prénom.';

NOTIFY pgrst, 'reload schema';
