-- Proximité geo 4 niveaux pour suggest_profiles + badges client.
-- Source SQL : department_regions + region_neighbors
-- (miroir TS : src/lib/geoProximity.ts — garder aligné).
-- Corse et DOM-TOM : aucune région voisine.

CREATE TABLE IF NOT EXISTS public.department_regions (
  dept text PRIMARY KEY,
  region text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.region_neighbors (
  region text NOT NULL,
  neighbor text NOT NULL,
  PRIMARY KEY (region, neighbor)
);

ALTER TABLE public.department_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.region_neighbors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS department_regions_select ON public.department_regions;
CREATE POLICY department_regions_select
  ON public.department_regions FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS region_neighbors_select ON public.region_neighbors;
CREATE POLICY region_neighbors_select
  ON public.region_neighbors FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.department_regions TO anon, authenticated, service_role;
GRANT SELECT ON public.region_neighbors TO anon, authenticated, service_role;

TRUNCATE public.department_regions;
INSERT INTO public.department_regions (dept, region) VALUES
  ('75', 'Île-de-France'),
  ('77', 'Île-de-France'),
  ('78', 'Île-de-France'),
  ('91', 'Île-de-France'),
  ('92', 'Île-de-France'),
  ('93', 'Île-de-France'),
  ('94', 'Île-de-France'),
  ('95', 'Île-de-France'),
  ('02', 'Hauts-de-France'),
  ('59', 'Hauts-de-France'),
  ('60', 'Hauts-de-France'),
  ('62', 'Hauts-de-France'),
  ('80', 'Hauts-de-France'),
  ('08', 'Grand Est'),
  ('10', 'Grand Est'),
  ('51', 'Grand Est'),
  ('52', 'Grand Est'),
  ('54', 'Grand Est'),
  ('55', 'Grand Est'),
  ('57', 'Grand Est'),
  ('67', 'Grand Est'),
  ('68', 'Grand Est'),
  ('88', 'Grand Est'),
  ('21', 'Bourgogne-Franche-Comté'),
  ('25', 'Bourgogne-Franche-Comté'),
  ('39', 'Bourgogne-Franche-Comté'),
  ('58', 'Bourgogne-Franche-Comté'),
  ('70', 'Bourgogne-Franche-Comté'),
  ('71', 'Bourgogne-Franche-Comté'),
  ('89', 'Bourgogne-Franche-Comté'),
  ('90', 'Bourgogne-Franche-Comté'),
  ('18', 'Centre-Val de Loire'),
  ('28', 'Centre-Val de Loire'),
  ('36', 'Centre-Val de Loire'),
  ('37', 'Centre-Val de Loire'),
  ('41', 'Centre-Val de Loire'),
  ('45', 'Centre-Val de Loire'),
  ('14', 'Normandie'),
  ('27', 'Normandie'),
  ('50', 'Normandie'),
  ('61', 'Normandie'),
  ('76', 'Normandie'),
  ('22', 'Bretagne'),
  ('29', 'Bretagne'),
  ('35', 'Bretagne'),
  ('56', 'Bretagne'),
  ('44', 'Pays de la Loire'),
  ('49', 'Pays de la Loire'),
  ('53', 'Pays de la Loire'),
  ('72', 'Pays de la Loire'),
  ('85', 'Pays de la Loire'),
  ('16', 'Nouvelle-Aquitaine'),
  ('17', 'Nouvelle-Aquitaine'),
  ('19', 'Nouvelle-Aquitaine'),
  ('23', 'Nouvelle-Aquitaine'),
  ('24', 'Nouvelle-Aquitaine'),
  ('33', 'Nouvelle-Aquitaine'),
  ('40', 'Nouvelle-Aquitaine'),
  ('47', 'Nouvelle-Aquitaine'),
  ('64', 'Nouvelle-Aquitaine'),
  ('79', 'Nouvelle-Aquitaine'),
  ('86', 'Nouvelle-Aquitaine'),
  ('87', 'Nouvelle-Aquitaine'),
  ('09', 'Occitanie'),
  ('11', 'Occitanie'),
  ('12', 'Occitanie'),
  ('30', 'Occitanie'),
  ('31', 'Occitanie'),
  ('32', 'Occitanie'),
  ('34', 'Occitanie'),
  ('46', 'Occitanie'),
  ('48', 'Occitanie'),
  ('65', 'Occitanie'),
  ('66', 'Occitanie'),
  ('81', 'Occitanie'),
  ('82', 'Occitanie'),
  ('01', 'Auvergne-Rhône-Alpes'),
  ('03', 'Auvergne-Rhône-Alpes'),
  ('07', 'Auvergne-Rhône-Alpes'),
  ('15', 'Auvergne-Rhône-Alpes'),
  ('26', 'Auvergne-Rhône-Alpes'),
  ('38', 'Auvergne-Rhône-Alpes'),
  ('42', 'Auvergne-Rhône-Alpes'),
  ('43', 'Auvergne-Rhône-Alpes'),
  ('63', 'Auvergne-Rhône-Alpes'),
  ('69', 'Auvergne-Rhône-Alpes'),
  ('73', 'Auvergne-Rhône-Alpes'),
  ('74', 'Auvergne-Rhône-Alpes'),
  ('04', 'Provence-Alpes-Côte d''Azur'),
  ('05', 'Provence-Alpes-Côte d''Azur'),
  ('06', 'Provence-Alpes-Côte d''Azur'),
  ('13', 'Provence-Alpes-Côte d''Azur'),
  ('83', 'Provence-Alpes-Côte d''Azur'),
  ('84', 'Provence-Alpes-Côte d''Azur'),
  ('20', 'Corse'),
  ('2A', 'Corse'),
  ('2B', 'Corse'),
  ('2a', 'Corse'),
  ('2b', 'Corse'),
  ('971', 'Guadeloupe'),
  ('972', 'Martinique'),
  ('973', 'Guyane'),
  ('974', 'La Réunion'),
  ('975', 'Saint-Pierre-et-Miquelon'),
  ('976', 'Mayotte'),
  ('977', 'Saint-Barthélemy'),
  ('978', 'Saint-Martin'),
  ('984', 'Terres australes'),
  ('986', 'Wallis-et-Futuna'),
  ('987', 'Polynésie française'),
  ('988', 'Nouvelle-Calédonie');

TRUNCATE public.region_neighbors;
INSERT INTO public.region_neighbors (region, neighbor) VALUES
  ('Île-de-France', 'Hauts-de-France'),
  ('Île-de-France', 'Grand Est'),
  ('Île-de-France', 'Bourgogne-Franche-Comté'),
  ('Île-de-France', 'Centre-Val de Loire'),
  ('Île-de-France', 'Normandie'),
  ('Hauts-de-France', 'Île-de-France'),
  ('Hauts-de-France', 'Grand Est'),
  ('Hauts-de-France', 'Normandie'),
  ('Grand Est', 'Hauts-de-France'),
  ('Grand Est', 'Île-de-France'),
  ('Grand Est', 'Bourgogne-Franche-Comté'),
  ('Bourgogne-Franche-Comté', 'Grand Est'),
  ('Bourgogne-Franche-Comté', 'Île-de-France'),
  ('Bourgogne-Franche-Comté', 'Centre-Val de Loire'),
  ('Bourgogne-Franche-Comté', 'Auvergne-Rhône-Alpes'),
  ('Centre-Val de Loire', 'Île-de-France'),
  ('Centre-Val de Loire', 'Normandie'),
  ('Centre-Val de Loire', 'Pays de la Loire'),
  ('Centre-Val de Loire', 'Nouvelle-Aquitaine'),
  ('Centre-Val de Loire', 'Auvergne-Rhône-Alpes'),
  ('Centre-Val de Loire', 'Bourgogne-Franche-Comté'),
  ('Normandie', 'Hauts-de-France'),
  ('Normandie', 'Île-de-France'),
  ('Normandie', 'Centre-Val de Loire'),
  ('Normandie', 'Pays de la Loire'),
  ('Normandie', 'Bretagne'),
  ('Bretagne', 'Normandie'),
  ('Bretagne', 'Pays de la Loire'),
  ('Pays de la Loire', 'Bretagne'),
  ('Pays de la Loire', 'Normandie'),
  ('Pays de la Loire', 'Centre-Val de Loire'),
  ('Pays de la Loire', 'Nouvelle-Aquitaine'),
  ('Nouvelle-Aquitaine', 'Pays de la Loire'),
  ('Nouvelle-Aquitaine', 'Centre-Val de Loire'),
  ('Nouvelle-Aquitaine', 'Auvergne-Rhône-Alpes'),
  ('Nouvelle-Aquitaine', 'Occitanie'),
  ('Occitanie', 'Nouvelle-Aquitaine'),
  ('Occitanie', 'Auvergne-Rhône-Alpes'),
  ('Occitanie', 'Provence-Alpes-Côte d''Azur'),
  ('Auvergne-Rhône-Alpes', 'Centre-Val de Loire'),
  ('Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté'),
  ('Auvergne-Rhône-Alpes', 'Nouvelle-Aquitaine'),
  ('Auvergne-Rhône-Alpes', 'Occitanie'),
  ('Auvergne-Rhône-Alpes', 'Provence-Alpes-Côte d''Azur'),
  ('Provence-Alpes-Côte d''Azur', 'Auvergne-Rhône-Alpes'),
  ('Provence-Alpes-Côte d''Azur', 'Occitanie');

CREATE OR REPLACE FUNCTION public.location_dept_code(p_location text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN cp IS NULL OR length(cp) < 2 THEN NULL
    WHEN left(cp, 2) IN ('97', '98') THEN left(cp, 3)
    ELSE left(cp, 2)
  END
  FROM (SELECT substring(COALESCE(p_location, '') FROM '\((\d{5})') AS cp) s;
$$;

CREATE OR REPLACE FUNCTION public.dept_to_region(p_dept text)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT dr.region
  FROM public.department_regions dr
  WHERE dr.dept = p_dept
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.suggest_profiles(integer, boolean, integer);

CREATE FUNCTION public.suggest_profiles(
  p_limit integer DEFAULT 20,
  p_same_city_only boolean DEFAULT false,
  p_min_interest_overlap integer DEFAULT 0
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
  is_boosted boolean
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
  my_min_age integer;
  my_location text;
  my_city text;
  my_dept text;
  my_region text;
  my_interests text[];
  my_gender text;
  min_overlap integer;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT p.birth_date, p.location, COALESCE(p.interests, '{}'), p.gender
  INTO my_birth, my_location, my_interests, my_gender
  FROM profiles p
  WHERE p.id = me;

  IF my_birth IS NULL THEN
    RETURN;
  END IF;

  my_age := public.profile_age(my_birth);
  my_min_age := public.min_partner_age(my_age);

  my_city := lower(trim(regexp_replace(COALESCE(my_location, ''), '\s*\(.*$', '')));
  my_dept := public.location_dept_code(my_location);
  my_region := public.dept_to_region(my_dept);

  IF COALESCE(p_min_interest_overlap, 0) = -1 THEN
    min_overlap := COALESCE(cardinality(my_interests), 0);
  ELSE
    min_overlap := GREATEST(COALESCE(p_min_interest_overlap, 0), 0);
  END IF;

  RETURN QUERY
  WITH liked AS (
    SELECT l.to_user AS uid FROM likes l WHERE l.from_user = me
  ),
  flashed AS (
    SELECT f.to_user AS uid FROM flashes f WHERE f.from_user = me
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
      EXISTS (
        SELECT 1 FROM profile_boosts b
        WHERE b.user_id = p.id
          AND b.payment_status IN ('paid', 'simulated')
          AND b.ends_at > now()
      ) AS boosted
    FROM profiles p
    WHERE p.id <> me
      AND p.has_children = false
      AND p.deletion_requested_at IS NULL
      AND p.id NOT IN (SELECT uid FROM liked)
      AND p.id NOT IN (SELECT uid FROM flashed)
      AND (
        my_gender IS NULL
        OR (my_gender = 'homme' AND p.gender = 'femme')
        OR (my_gender = 'femme' AND p.gender = 'homme')
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
  )
  SELECT
    s.id,
    s.display_name,
    s.birth_date,
    s.bio,
    s.has_children,
    s.location,
    s.interests,
    s.photo_url,
    s.gender,
    s.created_at,
    s.updated_at,
    s.rank_score,
    s.overlap,
    s.city_match,
    s.dept_match,
    s.region_match,
    s.neighbor_match,
    s.cand_age,
    s.boosted
  FROM scored s
  ORDER BY s.rank_score DESC, s.boosted DESC, s.created_at DESC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 20), 50), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_profiles(integer, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.location_dept_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dept_to_region(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
