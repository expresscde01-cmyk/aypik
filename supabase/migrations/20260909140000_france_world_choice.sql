-- France dans le monde : p_france_world_codes (outre-mer ∪ francophones, sans métropole).
-- ISO fournis par le client (worldGeo.ts). Tableau vide/NULL = filet is_french_territory (ancien client).

DROP FUNCTION IF EXISTS public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[], text[]);

CREATE OR REPLACE FUNCTION public.suggest_profiles(
  p_limit integer DEFAULT 20,
  p_same_city_only boolean DEFAULT false,
  p_min_interest_overlap integer DEFAULT 0,
  p_mode text DEFAULT 'home',
  p_geo_perimeter text DEFAULT NULL,
  p_radius_km numeric DEFAULT NULL,
  p_sort text DEFAULT NULL,
  p_created_after timestamptz DEFAULT NULL,
  p_exclude_ids uuid[] DEFAULT '{}',
  p_world_zones text[] DEFAULT NULL,
  p_france_world_codes text[] DEFAULT NULL
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
  founder_number integer,
  is_online boolean,
  country_code text,
  city_name text,
  world_zone text
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
  v_exclusive boolean := false;
  v_no_geo boolean := false;
  v_international boolean := false;
  v_french_world boolean := false;
  v_worldwide boolean := true;
  v_world_zones text[] := '{}';
  v_france_world_codes text[] := '{}';
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

  v_mode := lower(COALESCE(NULLIF(trim(p_mode), ''), 'home'));

  min_overlap := GREATEST(COALESCE(p_min_interest_overlap, 0), 0);

  v_perimeter := lower(trim(COALESCE(p_geo_perimeter, '')));
  v_exclusive := v_perimeter ~ '__x$';
  IF v_exclusive THEN
    v_perimeter := regexp_replace(v_perimeter, '__x$', '');
  END IF;

  v_international := v_perimeter = 'international';
  v_french_world := v_perimeter IN (
    'la_france_dans_le_monde',
    'france_dans_le_monde'
  );
  SELECT COALESCE(array_agg(lower(trim(z))), '{}'::text[])
    INTO v_world_zones
  FROM unnest(COALESCE(p_world_zones, '{}'::text[])) AS z
  WHERE length(trim(z)) > 0;
  v_world_zones := COALESCE(v_world_zones, '{}'::text[]);
  SELECT COALESCE(array_agg(upper(trim(c))), '{}'::text[])
    INTO v_france_world_codes
  FROM unnest(COALESCE(p_france_world_codes, '{}'::text[])) AS c
  WHERE length(trim(c)) > 0;
  v_france_world_codes := COALESCE(v_france_world_codes, '{}'::text[]);
  v_worldwide :=
    cardinality(v_world_zones) = 0
    OR 'worldwide' = ANY (v_world_zones)
    OR 'all' = ANY (v_world_zones)
    OR 'anywhere' = ANY (v_world_zones)
    OR 'mondiale' = ANY (v_world_zones)
    OR 'partout' = ANY (v_world_zones);

  -- Hexagone / France dans le monde / International : pas de strate admin France.
  v_no_geo :=
    v_international
    OR v_french_world
    OR v_perimeter IN ('', 'anywhere', 'all', 'null');
  IF v_no_geo AND NOT v_international AND NOT v_french_world THEN
    v_perimeter := 'anywhere';
    v_exclusive := false;
  ELSIF v_perimeter IN (
    'northeast', 'northwest', 'center', 'southeast', 'southwest',
    'ile_de_france'
  ) THEN
    v_exclusive := false;
  END IF;

  IF v_mode = 'discover' THEN
    v_limit := GREATEST(LEAST(COALESCE(p_limit, 80), 500), 1);
    v_sort := COALESCE(NULLIF(trim(p_sort), ''), 'nouveaux');
  ELSE
    v_limit := GREATEST(LEAST(COALESCE(p_limit, 20), 50), 1);
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
    UNION
    SELECT h.hidden_id FROM public.suggestion_refuse_hidden_ids(me) AS h
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
      ) AS founder_num,
      COALESCE(p.country_code, 'FR') AS cand_country,
      COALESCE(
        NULLIF(trim(p.city_name), ''),
        NULLIF(trim(regexp_replace(COALESCE(p.location, ''), '\s*\(.*$', '')), '')
      ) AS cand_city_name,
      COALESCE(wc.world_zone, 'europe') AS cand_world_zone
    FROM profiles p
    LEFT JOIN public.world_countries wc
      ON wc.iso2 = COALESCE(p.country_code, 'FR')
    WHERE p.id <> me
      AND p.has_children = false
      AND p.deletion_requested_at IS NULL
      AND p.paused_at IS NULL
      AND p.deactivated_at IS NULL
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
      AND (
        (
          v_international
          AND COALESCE(p.country_code, 'FR') <> 'FR'
          AND COALESCE(p.country_code, 'FR') NOT IN (
            SELECT iso2 FROM public.world_countries WHERE is_french_territory
          )
        )
        OR (
          v_french_world
          AND (
            (
              cardinality(v_france_world_codes) > 0
              AND COALESCE(p.country_code, 'FR') = ANY (v_france_world_codes)
            )
            OR (
              cardinality(v_france_world_codes) = 0
              AND COALESCE(p.country_code, 'FR') IN (
                SELECT iso2 FROM public.world_countries WHERE is_french_territory
              )
            )
          )
        )
        OR (
          NOT v_international
          AND NOT v_french_world
          AND COALESCE(p.country_code, 'FR') = 'FR'
        )
      )
      AND (
        NOT v_international
        OR v_worldwide
        OR COALESCE(wc.world_zone, 'europe') = ANY (v_world_zones)
      )
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
              AND public.regions_are_neighbors(my_region, c.cand_region) THEN 4
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
        AND public.regions_are_neighbors(my_region, c.cand_region)
      ) AS neighbor_match
    FROM candidates c
    WHERE public.dating_partner_old_enough(my_birth, c.birth_date)
      AND public.dating_partner_old_enough(c.birth_date, my_birth)
      AND c.overlap >= min_overlap
      AND (
        v_no_geo
        OR NOT COALESCE(p_same_city_only, false)
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
      CASE
        WHEN v_international OR v_french_world OR v_no_geo OR v_perimeter IN ('anywhere', 'all') THEN true
        WHEN v_perimeter = 'city' THEN s.city_match
        WHEN v_perimeter = 'department' THEN
          CASE
            WHEN v_exclusive THEN s.dept_match AND NOT s.city_match
            ELSE s.city_match OR s.dept_match
          END
        WHEN v_perimeter = 'region' THEN
          CASE
            WHEN v_exclusive THEN
              s.region_match AND NOT s.dept_match AND NOT s.city_match
            ELSE s.city_match OR s.dept_match OR s.region_match
          END
        WHEN v_perimeter = 'neighboring_region' THEN
          CASE
            WHEN v_exclusive THEN
              s.neighbor_match
              AND NOT COALESCE(s.region_match, false)
              AND NOT COALESCE(s.dept_match, false)
              AND NOT COALESCE(s.city_match, false)
            ELSE
              s.city_match OR s.dept_match OR s.region_match OR s.neighbor_match
          END
        WHEN v_perimeter = 'ile_de_france' THEN
          s.cand_region = 'Île-de-France'
        WHEN v_perimeter = 'center' THEN
          public.region_macro_zone(s.cand_region) = 'center'
          AND s.cand_region IS DISTINCT FROM 'Île-de-France'
        WHEN v_perimeter IN ('northeast', 'northwest', 'southeast', 'southwest') THEN
          public.region_macro_zone(s.cand_region) = v_perimeter
        WHEN v_perimeter = 'radius' THEN
          (
            s.dist_km IS NOT NULL AND s.dist_km <= v_radius
          )
          OR (
            s.dist_km IS NULL AND s.city_match
          )
        ELSE false
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
    CASE WHEN g.incognito_at IS NOT NULL THEN NULL ELSE g.last_active_at END,
    0::integer,
    g.founder,
    g.founder_num::integer,
    public.profile_is_online_for_viewer(g.incognito_at, g.last_active_at),
    g.cand_country,
    g.cand_city_name,
    g.cand_world_zone
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

COMMENT ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[], text[], text[]) IS
  'Accueil / Découvrir. Hexagone : FR. France dans le monde : p_france_world_codes. International : continents hors is_french_territory.';

REVOKE ALL ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[], text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[], text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[], text[], text[]) TO service_role;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

