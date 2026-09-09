
-- Le filtre "zones macro" (Nord-Ouest/Nord-Est/Sud-Ouest/Sud-Est/Île-de-France) est
-- vivant côté front (src/lib/geoProximity.ts, DiscoveryPage.tsx : GEO_MACRO_ZONES,
-- MACRO_ZONE_REGIONS, boutons de filtre) mais jamais arrivé côté base : ni la table
-- region_macro_zones, ni la fonction region_macro_zone() n'existaient. Le
-- suggest_profiles() actuel ne reconnaît donc pas ces valeurs de p_geo_perimeter et
-- retombe sur "ville OU département OU région" — bien plus restrictif qu'une zone qui
-- couvre plusieurs régions. Le filtre client (matchesGeoPerimeter/locationInMacroZone)
-- ne peut que réduire ce que la base a déjà renvoyé, jamais l'élargir : résultat, un
-- utilisateur en Bretagne qui choisit "Nord-Ouest" ne voit jamais les profils de
-- Normandie / Pays de la Loire.
--
-- Reprend le schéma du candidat 20260819100000_geo_macro_zones.sql (table + fonction),
-- et ajoute les branches manquantes dans le CASE géographique de la version de
-- suggest_profiles() réellement en prod aujourd'hui (celle avec p_mode/p_sort/
-- p_created_after/p_exclude_ids et le tri par distance/activité), sans toucher au
-- reste de sa logique.

CREATE TABLE IF NOT EXISTS public.region_macro_zones (
  region text PRIMARY KEY,
  zone text NOT NULL
    CHECK (zone IN ('northeast', 'northwest', 'center', 'southeast', 'southwest', 'ile_de_france'))
);

ALTER TABLE public.region_macro_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS region_macro_zones_select ON public.region_macro_zones;
CREATE POLICY region_macro_zones_select
  ON public.region_macro_zones FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.region_macro_zones FROM anon;
GRANT SELECT ON public.region_macro_zones TO authenticated, service_role;

INSERT INTO public.region_macro_zones (region, zone) VALUES
  ('Bretagne', 'northwest'),
  ('Normandie', 'northwest'),
  ('Pays de la Loire', 'northwest'),
  ('Hauts-de-France', 'northeast'),
  ('Grand Est', 'northeast'),
  ('Île-de-France', 'ile_de_france'),
  ('Centre-Val de Loire', 'center'),
  ('Bourgogne-Franche-Comté', 'center'),
  ('Nouvelle-Aquitaine', 'southwest'),
  ('Occitanie', 'southwest'),
  ('Auvergne-Rhône-Alpes', 'southeast'),
  ('Provence-Alpes-Côte d''Azur', 'southeast'),
  ('Corse', 'southeast')
ON CONFLICT (region) DO UPDATE SET zone = EXCLUDED.zone;

CREATE OR REPLACE FUNCTION public.region_macro_zone(p_region text)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT z.zone
  FROM public.region_macro_zones z
  WHERE z.region = p_region;
$$;

COMMENT ON FUNCTION public.region_macro_zone(text) IS
  'Quartier macro (northwest / northeast / center / southwest / southeast / ile_de_france) d''une région.';

REVOKE ALL ON FUNCTION public.region_macro_zone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.region_macro_zone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.region_macro_zone(text) TO service_role;

CREATE OR REPLACE FUNCTION public.suggest_profiles(p_limit integer DEFAULT 20, p_same_city_only boolean DEFAULT false, p_min_interest_overlap integer DEFAULT 0, p_mode text DEFAULT 'home'::text, p_geo_perimeter text DEFAULT NULL::text, p_radius_km numeric DEFAULT NULL::numeric, p_sort text DEFAULT NULL::text, p_created_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_exclude_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS TABLE(id uuid, display_name text, birth_date date, bio text, has_children boolean, location text, interests text[], photo_url text, gender text, created_at timestamp with time zone, updated_at timestamp with time zone, score numeric, mutual_interest_count integer, same_city boolean, same_department boolean, same_region boolean, neighboring_region boolean, age integer, is_boosted boolean, distance_km numeric, last_active_at timestamp with time zone, activity_score integer, is_founder boolean, founder_number integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        WHEN 'ile_de_france' THEN
          s.cand_region = 'Île-de-France'
        WHEN 'center' THEN
          public.region_macro_zone(s.cand_region) = 'center'
        WHEN 'northeast' THEN
          public.region_macro_zone(s.cand_region) = 'northeast'
        WHEN 'northwest' THEN
          public.region_macro_zone(s.cand_region) = 'northwest'
        WHEN 'southeast' THEN
          public.region_macro_zone(s.cand_region) = 'southeast'
        WHEN 'southwest' THEN
          public.region_macro_zone(s.cand_region) = 'southwest'
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
$function$;

COMMENT ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[]) IS
  'Accueil (home) et Découvrir (discover). PARTOUT/anywhere = aucun filtre geo. Zones macro (northeast/northwest/center/southeast/southwest/ile_de_france) via region_macro_zone().';

REVOKE ALL ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
