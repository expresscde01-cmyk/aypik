-- Coller TOUT ce fichier dans Supabase → SQL Editor, puis Run.
-- Phase 1 scalabilité : lat/lng, index Découvrir, suggest_profiles paginée.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

UPDATE public.profiles
SET last_active_at = COALESCE(last_active_at, updated_at, created_at)
WHERE last_active_at IS NULL;

CREATE INDEX IF NOT EXISTS profiles_created_at_idx
  ON public.profiles (created_at DESC)
  WHERE deletion_requested_at IS NULL;

CREATE INDEX IF NOT EXISTS profiles_gender_idx
  ON public.profiles (gender)
  WHERE deletion_requested_at IS NULL AND has_children = false;

CREATE INDEX IF NOT EXISTS profiles_interests_gin
  ON public.profiles USING GIN (interests);

CREATE INDEX IF NOT EXISTS profiles_discovery_active_birth_idx
  ON public.profiles (birth_date)
  WHERE has_children = false AND deletion_requested_at IS NULL;

CREATE INDEX IF NOT EXISTS profiles_last_active_idx
  ON public.profiles (last_active_at DESC NULLS LAST)
  WHERE deletion_requested_at IS NULL AND has_children = false;

CREATE INDEX IF NOT EXISTS profiles_lat_lng_idx
  ON public.profiles (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL AND deletion_requested_at IS NULL;

CREATE INDEX IF NOT EXISTS likes_from_created_idx
  ON public.likes (from_user, created_at DESC);

CREATE INDEX IF NOT EXISTS flashes_from_created_idx
  ON public.flashes (from_user, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_sender_created_idx
  ON public.messages (sender_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.geo_distance_km(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
    ELSE 6371 * acos(LEAST(1::double precision, GREATEST(-1::double precision,
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2) - radians(lng1))
      + sin(radians(lat1)) * sin(radians(lat2))
    )))
  END;
$$;

CREATE OR REPLACE FUNCTION public.touch_last_active_from_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_active_at = now()
  WHERE id = NEW.from_user;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_last_active_from_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_active_at = now()
  WHERE id = NEW.sender_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS likes_touch_last_active ON public.likes;
CREATE TRIGGER likes_touch_last_active
  AFTER INSERT ON public.likes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_last_active_from_user();

DROP TRIGGER IF EXISTS flashes_touch_last_active ON public.flashes;
CREATE TRIGGER flashes_touch_last_active
  AFTER INSERT ON public.flashes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_last_active_from_user();

DROP TRIGGER IF EXISTS messages_touch_last_active ON public.messages;
CREATE TRIGGER messages_touch_last_active
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_last_active_from_sender();

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'suggest_profiles'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.suggest_profiles(
  p_limit integer DEFAULT 20,
  p_same_city_only boolean DEFAULT false,
  p_min_interest_overlap integer DEFAULT 0,
  p_mode text DEFAULT 'home',
  p_geo_perimeter text DEFAULT NULL,
  p_radius_km numeric DEFAULT NULL,
  p_sort text DEFAULT NULL,
  p_created_after timestamptz DEFAULT NULL,
  p_exclude_ids uuid[] DEFAULT '{}'
)
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
  created_at timestamptz,
  updated_at timestamptz,
  score numeric,
  mutual_interest_count integer,
  same_city boolean,
  same_department boolean,
  same_region boolean,
  neighboring_region boolean,
  age integer,
  is_boosted boolean,
  distance_km numeric,
  last_active_at timestamptz,
  activity_score integer,
  is_founder boolean,
  founder_number integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_birth date;
  my_age integer;
  my_location text;
  my_city text;
  my_dept text;
  my_region text;
  my_interests text[];
  my_gender text;
  my_lat double precision;
  my_lng double precision;
  min_overlap integer;
  v_mode text;
  v_perimeter text;
  v_sort text;
  v_limit integer;
  v_radius numeric;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT
    p.birth_date,
    p.location,
    COALESCE(p.interests, '{}'),
    p.gender,
    p.lat,
    p.lng
  INTO my_birth, my_location, my_interests, my_gender, my_lat, my_lng
  FROM profiles p
  WHERE p.id = me;

  IF my_birth IS NULL THEN
    RETURN;
  END IF;

  my_age := public.profile_age(my_birth);
  my_city := lower(trim(regexp_replace(COALESCE(my_location, ''), '\s*\(.*$', '')));
  my_dept := public.location_dept_code(my_location);
  my_region := public.dept_to_region(my_dept);

  IF COALESCE(p_min_interest_overlap, 0) = -1 THEN
    min_overlap := COALESCE(cardinality(my_interests), 0);
  ELSE
    min_overlap := GREATEST(COALESCE(p_min_interest_overlap, 0), 0);
  END IF;

  v_mode := lower(COALESCE(NULLIF(trim(p_mode), ''), 'home'));
  IF v_mode = 'discover' THEN
    v_limit := GREATEST(LEAST(COALESCE(p_limit, 80), 120), 1);
    v_perimeter := COALESCE(NULLIF(trim(p_geo_perimeter), ''), 'anywhere');
    v_sort := COALESCE(NULLIF(trim(p_sort), ''), 'nouveaux');
  ELSE
    v_limit := GREATEST(LEAST(COALESCE(p_limit, 20), 50), 1);
    v_perimeter := COALESCE(NULLIF(trim(p_geo_perimeter), ''), 'region');
    v_sort := COALESCE(NULLIF(trim(p_sort), ''), 'score');
  END IF;

  v_radius := COALESCE(p_radius_km, 100);

  RETURN QUERY
  WITH liked AS (
    SELECT l.to_user AS uid FROM likes l WHERE l.from_user = me
  ),
  flashed AS (
    SELECT f.to_user AS uid FROM flashes f WHERE f.from_user = me
  ),
  excluded AS (
    SELECT uid FROM liked
    UNION
    SELECT uid FROM flashed
    UNION
    SELECT x FROM unnest(COALESCE(p_exclude_ids, '{}'::uuid[])) AS x
  ),
  candidates AS (
    SELECT
      p.*,
      public.profile_age(p.birth_date) AS cand_age,
      (
        SELECT COUNT(*)::integer
        FROM unnest(COALESCE(p.interests, '{}')) i
        WHERE i = ANY (my_interests)
      ) AS overlap,
      lower(trim(regexp_replace(COALESCE(p.location, ''), '\s*\(.*$', ''))) AS cand_city,
      public.location_dept_code(p.location) AS cand_dept,
      public.dept_to_region(public.location_dept_code(p.location)) AS cand_region,
      public.geo_distance_km(my_lat, my_lng, p.lat, p.lng)::numeric AS dist_km,
      EXISTS (
        SELECT 1 FROM profile_boosts b
        WHERE b.user_id = p.id
          AND b.payment_status IN ('paid', 'simulated')
          AND b.ends_at > now()
      ) AS boosted,
      EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.user_id = p.id AND m.is_founder IS TRUE
      ) AS founder,
      (
        SELECT m.founder_number
        FROM memberships m
        WHERE m.user_id = p.id AND m.is_founder IS TRUE
        LIMIT 1
      ) AS founder_num
    FROM profiles p
    WHERE p.id <> me
      AND p.has_children = false
      AND p.deletion_requested_at IS NULL
      AND p.id NOT IN (SELECT uid FROM excluded)
      AND (
        my_gender IS NULL
        OR (my_gender = 'homme' AND p.gender = 'femme')
        OR (my_gender = 'femme' AND p.gender = 'homme')
      )
      AND (
        min_overlap <= 0
        OR COALESCE(p.interests, '{}') && my_interests
      )
      AND (p_created_after IS NULL OR p.created_at >= p_created_after)
  ),
  scored AS (
    SELECT
      c.*,
      (
        (c.overlap * 40)::numeric
        + CASE
            WHEN COALESCE(my_location, '') <> '' AND c.location = my_location THEN 35
            WHEN my_city <> '' AND c.cand_city = my_city THEN 28
            WHEN my_dept IS NOT NULL AND c.cand_dept = my_dept THEN 15
            WHEN my_region IS NOT NULL AND c.cand_region = my_region THEN 8
            WHEN my_region IS NOT NULL
              AND c.cand_region IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM public.region_neighbors n
                WHERE n.region = my_region AND n.neighbor = c.cand_region
              ) THEN 4
            ELSE 0
          END
        + GREATEST(0, 20 - ABS(c.cand_age - my_age))::numeric
        + CASE WHEN c.boosted THEN 25 ELSE 0 END
      ) AS rank_score,
      (COALESCE(my_location, '') <> '' AND c.location = my_location)
        OR (my_city <> '' AND c.cand_city = my_city) AS city_match,
      (my_dept IS NOT NULL AND c.cand_dept = my_dept) AS dept_match,
      (my_region IS NOT NULL AND c.cand_region = my_region) AS region_match,
      (
        my_region IS NOT NULL
        AND c.cand_region IS NOT NULL
        AND my_region <> c.cand_region
        AND EXISTS (
          SELECT 1 FROM public.region_neighbors n
          WHERE n.region = my_region AND n.neighbor = c.cand_region
        )
      ) AS neighbor_match
    FROM candidates c
    WHERE public.dating_partner_old_enough(my_birth, c.birth_date)
      AND public.dating_partner_old_enough(c.birth_date, my_birth)
      AND c.overlap >= min_overlap
      AND (
        NOT COALESCE(p_same_city_only, false)
        OR (
          (COALESCE(my_location, '') <> '' AND c.location = my_location)
          OR (my_city <> '' AND c.cand_city = my_city)
        )
      )
  ),
  gated AS (
    SELECT s.*
    FROM scored s
    WHERE
      CASE v_perimeter
        WHEN 'anywhere' THEN true
        WHEN 'city' THEN s.city_match
        WHEN 'department' THEN s.city_match OR s.dept_match
        WHEN 'region' THEN s.city_match OR s.dept_match OR s.region_match
        WHEN 'neighboring_region' THEN
          s.city_match OR s.dept_match OR s.region_match OR s.neighbor_match
        WHEN 'radius' THEN
          (
            s.dist_km IS NOT NULL AND s.dist_km <= v_radius
          )
          OR (
            s.dist_km IS NULL AND s.city_match
          )
        ELSE s.city_match OR s.dept_match OR s.region_match
      END
  )
  SELECT
    g.id,
    g.display_name,
    g.birth_date,
    g.bio,
    g.has_children,
    g.location,
    g.interests,
    g.photo_url,
    g.gender,
    g.created_at,
    g.updated_at,
    g.rank_score,
    g.overlap,
    g.city_match,
    g.dept_match,
    g.region_match,
    g.neighbor_match,
    g.cand_age::integer,
    g.boosted,
    g.dist_km::numeric,
    COALESCE(g.last_active_at, g.updated_at, g.created_at),
    0::integer,
    g.founder,
    g.founder_num::integer
  FROM gated g
  ORDER BY
    CASE WHEN v_sort = 'distance' THEN COALESCE(g.dist_km, 1e9) END ASC NULLS LAST,
    CASE WHEN v_sort = 'interests' THEN g.overlap END DESC,
    CASE
      WHEN v_sort = 'actifs' THEN EXTRACT(EPOCH FROM COALESCE(g.last_active_at, g.updated_at, g.created_at))
    END DESC NULLS LAST,
    CASE WHEN v_sort = 'nouveaux' THEN EXTRACT(EPOCH FROM g.created_at) END DESC NULLS LAST,
    CASE WHEN v_sort = 'score' THEN g.rank_score END DESC NULLS LAST,
    g.boosted DESC,
    g.created_at DESC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[]) IS
  'Accueil (home) et Découvrir (discover) : shortlist filtrée en SQL, plus de scan client.';

REVOKE ALL ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
