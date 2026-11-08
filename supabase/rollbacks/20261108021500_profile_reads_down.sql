-- Retour arrière de 20261108021500_profile_reads.
-- À lancer à la main seulement. supabase db push ne l'applique pas.

DROP FUNCTION IF EXISTS public.suggest_profiles(
  integer, boolean, integer, text, text, numeric, text, timestamp with time zone,
  uuid[], text[], text[], text, text[], jsonb, text[], text, boolean
);

ALTER FUNCTION public.suggest_profiles_core(
  integer, boolean, integer, text, text, numeric, text, timestamp with time zone,
  uuid[], text[], text[], text, text[], jsonb, text[], text, boolean
) RENAME TO suggest_profiles;

GRANT EXECUTE ON FUNCTION public.suggest_profiles(
  integer, boolean, integer, text, text, numeric, text, timestamp with time zone,
  uuid[], text[], text[], text, text[], jsonb, text[], text, boolean
) TO authenticated, service_role;

ALTER FUNCTION public.profile_is_deactivated(uuid) SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.profile_is_deactivated(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.card_profiles(uuid[]);

CREATE FUNCTION public.card_profiles(p_ids uuid[])
RETURNS TABLE (
  id uuid,
  display_name text,
  bio text,
  has_children boolean,
  location text,
  interests text[],
  photo_url text,
  gender text,
  is_online boolean,
  discover_mode text,
  age integer,
  country_code text,
  city_name text,
  geoname_id bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.display_name,
    p.bio,
    p.has_children,
    p.location,
    p.interests,
    p.photo_url,
    p.gender,
    public.profile_is_online_for_viewer(p.incognito_at, p.last_active_at),
    p.discover_mode,
    public.profile_age(p.birth_date),
    p.country_code,
    p.city_name,
    p.geoname_id
  FROM public.profiles p
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND p.id = ANY (COALESCE(p_ids, '{}'::uuid[]))
    AND p.deletion_requested_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.card_profiles(uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.card_profiles(uuid[]) FROM anon, PUBLIC;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all"
ON public.profiles
FOR SELECT
TO authenticated
USING ((deletion_requested_at IS NULL) OR ((SELECT auth.uid()) = id));

DROP FUNCTION IF EXISTS public.consume_profile_read(integer);
DROP TABLE IF EXISTS public.profile_read_windows;
