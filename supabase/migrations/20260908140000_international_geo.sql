-- Coller TOUT ce fichier dans Supabase → SQL Editor, puis Run.
-- Mode International : pays déclaré, référentiel GeoNames, gate France sur suggest_profiles.
-- Villes mondiales ensuite : npm run seed:geonames
-- (VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans .env).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_code text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city_name text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS geoname_id bigint;

UPDATE public.profiles
SET country_code = 'FR'
WHERE country_code IS NULL OR btrim(country_code) = '';

UPDATE public.profiles
SET city_name = nullif(trim(regexp_replace(COALESCE(location, ''), '\s*\(.*$', '')), '')
WHERE city_name IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN country_code SET DEFAULT 'FR';

ALTER TABLE public.profiles
  ALTER COLUMN country_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_country_code_idx
  ON public.profiles (country_code);

COMMENT ON COLUMN public.profiles.country_code IS
  'ISO 3166-1 alpha-2 déclaré (défaut FR). Jamais de GPS live.';
COMMENT ON COLUMN public.profiles.city_name IS
  'Ville déclarée. FR : nom avant le CP ; hors FR : nom GeoNames.';
COMMENT ON COLUMN public.profiles.geoname_id IS
  'Identifiant GeoNames de la ville déclarée (hors FR).';

CREATE TABLE IF NOT EXISTS public.world_countries (
  iso2 text PRIMARY KEY,
  name_fr text NOT NULL,
  world_zone text NOT NULL
    CHECK (world_zone IN (
      'europe',
      'north_america',
      'central_america',
      'south_america',
      'africa',
      'asia',
      'oceania'
    ))
);

CREATE TABLE IF NOT EXISTS public.world_cities (
  geoname_id bigint PRIMARY KEY,
  name text NOT NULL,
  ascii_name text,
  country_code text NOT NULL REFERENCES public.world_countries (iso2),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  population integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS world_cities_country_name_idx
  ON public.world_cities (country_code, lower(name) text_pattern_ops);

CREATE INDEX IF NOT EXISTS world_cities_country_pop_idx
  ON public.world_cities (country_code, population DESC);

ALTER TABLE public.world_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS world_countries_select ON public.world_countries;
CREATE POLICY world_countries_select
  ON public.world_countries FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS world_cities_select ON public.world_cities;
CREATE POLICY world_cities_select
  ON public.world_cities FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.world_countries FROM anon;
REVOKE ALL ON public.world_cities FROM anon;
GRANT SELECT ON public.world_countries TO authenticated, service_role;
GRANT SELECT ON public.world_cities TO authenticated, service_role;
GRANT SELECT (country_code, city_name, geoname_id) ON public.profiles TO authenticated;
GRANT ALL ON public.world_cities TO service_role;
GRANT ALL ON public.world_countries TO service_role;

INSERT INTO public.world_countries (iso2, name_fr, world_zone) VALUES
  ('AD', 'Andorre', 'europe'),
  ('AE', 'Émirats arabes unis', 'asia'),
  ('AF', 'Afghanistan', 'asia'),
  ('AG', 'Antigua-et-Barbuda', 'central_america'),
  ('AI', 'Anguilla', 'central_america'),
  ('AL', 'Albanie', 'europe'),
  ('AM', 'Arménie', 'asia'),
  ('AO', 'Angola', 'africa'),
  ('AQ', 'Antarctique', 'oceania'),
  ('AR', 'Argentine', 'south_america'),
  ('AS', 'Samoa américaines', 'oceania'),
  ('AT', 'Autriche', 'europe'),
  ('AU', 'Australie', 'oceania'),
  ('AW', 'Aruba', 'central_america'),
  ('AX', 'Åland', 'europe'),
  ('AZ', 'Azerbaïdjan', 'asia'),
  ('BA', 'Bosnie-Herzégovine', 'europe'),
  ('BB', 'Barbade', 'central_america'),
  ('BD', 'Bangladesh', 'asia'),
  ('BE', 'Belgique', 'europe'),
  ('BF', 'Burkina Faso', 'africa'),
  ('BG', 'Bulgarie', 'europe'),
  ('BH', 'Bahreïn', 'asia'),
  ('BI', 'Burundi', 'africa'),
  ('BJ', 'Bénin', 'africa'),
  ('BL', 'Saint-Barthélemy', 'central_america'),
  ('BM', 'Bermudes', 'north_america'),
  ('BN', 'Brunei', 'asia'),
  ('BO', 'Bolivie', 'south_america'),
  ('BQ', 'Bonaire, Saint-Eustache et Saba', 'central_america'),
  ('BR', 'Brésil', 'south_america'),
  ('BS', 'Bahamas', 'central_america'),
  ('BT', 'Bhoutan', 'asia'),
  ('BV', 'Île Bouvet', 'oceania'),
  ('BW', 'Botswana', 'africa'),
  ('BY', 'Biélorussie', 'europe'),
  ('BZ', 'Belize', 'central_america'),
  ('CA', 'Canada', 'north_america'),
  ('CC', 'Îles Cocos', 'oceania'),
  ('CD', 'Congo (RDC)', 'africa'),
  ('CF', 'République centrafricaine', 'africa'),
  ('CG', 'Congo', 'africa'),
  ('CH', 'Suisse', 'europe'),
  ('CI', 'Côte d’Ivoire', 'africa'),
  ('CK', 'Îles Cook', 'oceania'),
  ('CL', 'Chili', 'south_america'),
  ('CM', 'Cameroun', 'africa'),
  ('CN', 'Chine', 'asia'),
  ('CO', 'Colombie', 'south_america'),
  ('CR', 'Costa Rica', 'central_america'),
  ('CU', 'Cuba', 'central_america'),
  ('CV', 'Cap-Vert', 'africa'),
  ('CW', 'Curaçao', 'central_america'),
  ('CX', 'Île Christmas', 'oceania'),
  ('CY', 'Chypre', 'europe'),
  ('CZ', 'Tchéquie', 'europe'),
  ('DE', 'Allemagne', 'europe'),
  ('DJ', 'Djibouti', 'africa'),
  ('DK', 'Danemark', 'europe'),
  ('DM', 'Dominique', 'central_america'),
  ('DO', 'République dominicaine', 'central_america'),
  ('DZ', 'Algérie', 'africa'),
  ('EC', 'Équateur', 'south_america'),
  ('EE', 'Estonie', 'europe'),
  ('EG', 'Égypte', 'africa'),
  ('EH', 'Sahara occidental', 'africa'),
  ('ER', 'Érythrée', 'africa'),
  ('ES', 'Espagne', 'europe'),
  ('ET', 'Éthiopie', 'africa'),
  ('FI', 'Finlande', 'europe'),
  ('FJ', 'Fidji', 'oceania'),
  ('FK', 'Îles Malouines', 'south_america'),
  ('FM', 'Micronésie', 'oceania'),
  ('FO', 'Îles Féroé', 'europe'),
  ('FR', 'France', 'europe'),
  ('GA', 'Gabon', 'africa'),
  ('GB', 'Royaume-Uni', 'europe'),
  ('GD', 'Grenade', 'central_america'),
  ('GE', 'Géorgie', 'europe'),
  ('GF', 'Guyane', 'south_america'),
  ('GG', 'Guernesey', 'europe'),
  ('GH', 'Ghana', 'africa'),
  ('GI', 'Gibraltar', 'europe'),
  ('GL', 'Groenland', 'north_america'),
  ('GM', 'Gambie', 'africa'),
  ('GN', 'Guinée', 'africa'),
  ('GP', 'Guadeloupe', 'central_america'),
  ('GQ', 'Guinée équatoriale', 'africa'),
  ('GR', 'Grèce', 'europe'),
  ('GS', 'Géorgie du Sud', 'south_america'),
  ('GT', 'Guatemala', 'central_america'),
  ('GU', 'Guam', 'oceania'),
  ('GW', 'Guinée-Bissau', 'africa'),
  ('GY', 'Guyana', 'south_america'),
  ('HK', 'Hong Kong', 'asia'),
  ('HM', 'Îles Heard-et-MacDonald', 'oceania'),
  ('HN', 'Honduras', 'central_america'),
  ('HR', 'Croatie', 'europe'),
  ('HT', 'Haïti', 'central_america'),
  ('HU', 'Hongrie', 'europe'),
  ('ID', 'Indonésie', 'asia'),
  ('IE', 'Irlande', 'europe'),
  ('IL', 'Israël', 'asia'),
  ('IM', 'Île de Man', 'europe'),
  ('IN', 'Inde', 'asia'),
  ('IO', 'Territoire britannique de l’océan Indien', 'asia'),
  ('IQ', 'Irak', 'asia'),
  ('IR', 'Iran', 'asia'),
  ('IS', 'Islande', 'europe'),
  ('IT', 'Italie', 'europe'),
  ('JE', 'Jersey', 'europe'),
  ('JM', 'Jamaïque', 'central_america'),
  ('JO', 'Jordanie', 'asia'),
  ('JP', 'Japon', 'asia'),
  ('KE', 'Kenya', 'africa'),
  ('KG', 'Kirghizistan', 'asia'),
  ('KH', 'Cambodge', 'asia'),
  ('KI', 'Kiribati', 'oceania'),
  ('KM', 'Comores', 'africa'),
  ('KN', 'Saint-Kitts-et-Nevis', 'central_america'),
  ('KP', 'Corée du Nord', 'asia'),
  ('KR', 'Corée du Sud', 'asia'),
  ('KW', 'Koweït', 'asia'),
  ('KY', 'Îles Caïmans', 'central_america'),
  ('KZ', 'Kazakhstan', 'asia'),
  ('LA', 'Laos', 'asia'),
  ('LB', 'Liban', 'asia'),
  ('LC', 'Sainte-Lucie', 'central_america'),
  ('LI', 'Liechtenstein', 'europe'),
  ('LK', 'Sri Lanka', 'asia'),
  ('LR', 'Liberia', 'africa'),
  ('LS', 'Lesotho', 'africa'),
  ('LT', 'Lituanie', 'europe'),
  ('LU', 'Luxembourg', 'europe'),
  ('LV', 'Lettonie', 'europe'),
  ('LY', 'Libye', 'africa'),
  ('MA', 'Maroc', 'africa'),
  ('MC', 'Monaco', 'europe'),
  ('MD', 'Moldavie', 'europe'),
  ('ME', 'Monténégro', 'europe'),
  ('MF', 'Saint-Martin', 'central_america'),
  ('MG', 'Madagascar', 'africa'),
  ('MH', 'Îles Marshall', 'oceania'),
  ('MK', 'Macédoine du Nord', 'europe'),
  ('ML', 'Mali', 'africa'),
  ('MM', 'Myanmar', 'asia'),
  ('MN', 'Mongolie', 'asia'),
  ('MO', 'Macao', 'asia'),
  ('MP', 'Îles Mariannes du Nord', 'oceania'),
  ('MQ', 'Martinique', 'central_america'),
  ('MR', 'Mauritanie', 'africa'),
  ('MS', 'Montserrat', 'central_america'),
  ('MT', 'Malte', 'europe'),
  ('MU', 'Maurice', 'africa'),
  ('MV', 'Maldives', 'asia'),
  ('MW', 'Malawi', 'africa'),
  ('MX', 'Mexique', 'north_america'),
  ('MY', 'Malaisie', 'asia'),
  ('MZ', 'Mozambique', 'africa'),
  ('NA', 'Namibie', 'africa'),
  ('NC', 'Nouvelle-Calédonie', 'oceania'),
  ('NE', 'Niger', 'africa'),
  ('NF', 'Île Norfolk', 'oceania'),
  ('NG', 'Nigeria', 'africa'),
  ('NI', 'Nicaragua', 'central_america'),
  ('NL', 'Pays-Bas', 'europe'),
  ('NO', 'Norvège', 'europe'),
  ('NP', 'Népal', 'asia'),
  ('NR', 'Nauru', 'oceania'),
  ('NU', 'Niue', 'oceania'),
  ('NZ', 'Nouvelle-Zélande', 'oceania'),
  ('OM', 'Oman', 'asia'),
  ('PA', 'Panama', 'central_america'),
  ('PE', 'Pérou', 'south_america'),
  ('PF', 'Polynésie française', 'oceania'),
  ('PG', 'Papouasie-Nouvelle-Guinée', 'oceania'),
  ('PH', 'Philippines', 'asia'),
  ('PK', 'Pakistan', 'asia'),
  ('PL', 'Pologne', 'europe'),
  ('PM', 'Saint-Pierre-et-Miquelon', 'north_america'),
  ('PN', 'Pitcairn', 'oceania'),
  ('PR', 'Porto Rico', 'central_america'),
  ('PS', 'Palestine', 'asia'),
  ('PT', 'Portugal', 'europe'),
  ('PW', 'Palaos', 'oceania'),
  ('PY', 'Paraguay', 'south_america'),
  ('QA', 'Qatar', 'asia'),
  ('RE', 'La Réunion', 'africa'),
  ('RO', 'Roumanie', 'europe'),
  ('RS', 'Serbie', 'europe'),
  ('RU', 'Russie', 'europe'),
  ('RW', 'Rwanda', 'africa'),
  ('SA', 'Arabie saoudite', 'asia'),
  ('SB', 'Îles Salomon', 'oceania'),
  ('SC', 'Seychelles', 'africa'),
  ('SD', 'Soudan', 'africa'),
  ('SE', 'Suède', 'europe'),
  ('SG', 'Singapour', 'asia'),
  ('SH', 'Sainte-Hélène', 'africa'),
  ('SI', 'Slovénie', 'europe'),
  ('SJ', 'Svalbard', 'europe'),
  ('SK', 'Slovaquie', 'europe'),
  ('SL', 'Sierra Leone', 'africa'),
  ('SM', 'Saint-Marin', 'europe'),
  ('SN', 'Sénégal', 'africa'),
  ('SO', 'Somalie', 'africa'),
  ('SR', 'Suriname', 'south_america'),
  ('SS', 'Soudan du Sud', 'africa'),
  ('ST', 'Sao Tomé-et-Principe', 'africa'),
  ('SV', 'Salvador', 'central_america'),
  ('SX', 'Saint-Martin (Pays-Bas)', 'central_america'),
  ('SY', 'Syrie', 'asia'),
  ('SZ', 'Eswatini', 'africa'),
  ('TC', 'Îles Turques-et-Caïques', 'central_america'),
  ('TD', 'Tchad', 'africa'),
  ('TF', 'Terres australes françaises', 'oceania'),
  ('TG', 'Togo', 'africa'),
  ('TH', 'Thaïlande', 'asia'),
  ('TJ', 'Tadjikistan', 'asia'),
  ('TK', 'Tokelau', 'oceania'),
  ('TL', 'Timor oriental', 'asia'),
  ('TM', 'Turkménistan', 'asia'),
  ('TN', 'Tunisie', 'africa'),
  ('TO', 'Tonga', 'oceania'),
  ('TR', 'Turquie', 'europe'),
  ('TT', 'Trinité-et-Tobago', 'central_america'),
  ('TV', 'Tuvalu', 'oceania'),
  ('TW', 'Taïwan', 'asia'),
  ('TZ', 'Tanzanie', 'africa'),
  ('UA', 'Ukraine', 'europe'),
  ('UG', 'Ouganda', 'africa'),
  ('UM', 'Îles mineures éloignées des États-Unis', 'oceania'),
  ('US', 'États-Unis', 'north_america'),
  ('UY', 'Uruguay', 'south_america'),
  ('UZ', 'Ouzbékistan', 'asia'),
  ('VA', 'Vatican', 'europe'),
  ('VC', 'Saint-Vincent-et-les-Grenadines', 'central_america'),
  ('VE', 'Venezuela', 'south_america'),
  ('VG', 'Îles Vierges britanniques', 'central_america'),
  ('VI', 'Îles Vierges des États-Unis', 'central_america'),
  ('VN', 'Viêt Nam', 'asia'),
  ('VU', 'Vanuatu', 'oceania'),
  ('WF', 'Wallis-et-Futuna', 'oceania'),
  ('WS', 'Samoa', 'oceania'),
  ('XK', 'Kosovo', 'europe'),
  ('YE', 'Yémen', 'asia'),
  ('YT', 'Mayotte', 'africa'),
  ('ZA', 'Afrique du Sud', 'africa'),
  ('ZM', 'Zambie', 'africa'),
  ('ZW', 'Zimbabwe', 'africa')
ON CONFLICT (iso2) DO UPDATE SET
  name_fr = EXCLUDED.name_fr,
  world_zone = EXCLUDED.world_zone;

CREATE OR REPLACE FUNCTION public.search_world_cities(
  p_country text,
  p_query text,
  p_limit integer DEFAULT 15
)
RETURNS TABLE (
  geoname_id bigint,
  name text,
  country_code text,
  lat double precision,
  lng double precision,
  population integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.geoname_id,
    c.name,
    c.country_code,
    c.lat,
    c.lng,
    c.population
  FROM public.world_cities c
  WHERE c.country_code = upper(btrim(COALESCE(p_country, '')))
    AND length(btrim(COALESCE(p_query, ''))) >= 2
    AND (
      c.name ILIKE (btrim(p_query) || '%')
      OR COALESCE(c.ascii_name, '') ILIKE (btrim(p_query) || '%')
    )
  ORDER BY c.population DESC NULLS LAST, c.name ASC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 15), 30), 1);
$$;

REVOKE ALL ON FUNCTION public.search_world_cities(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_world_cities(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_world_cities(text, text, integer) TO service_role;

DROP FUNCTION IF EXISTS public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[]);

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
  p_world_zone text DEFAULT 'worldwide'
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
  v_world_zone text;
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
  v_world_zone := lower(trim(COALESCE(p_world_zone, 'worldwide')));
  IF v_world_zone IN ('', 'all', 'anywhere', 'mondiale', 'null') THEN
    v_world_zone := 'worldwide';
  END IF;

  -- PARTOUT / FRANCE ENTIÈRE : aucune clause admin France.
  -- International : aucune restriction de pays (zone continent optionnelle).
  v_no_geo := v_international OR v_perimeter IN ('', 'anywhere', 'all', 'null');
  IF v_no_geo AND NOT v_international THEN
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
        v_international
        OR COALESCE(p.country_code, 'FR') = 'FR'
      )
      AND (
        NOT v_international
        OR v_world_zone = 'worldwide'
        OR COALESCE(wc.world_zone, 'europe') = v_world_zone
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
        WHEN v_international OR v_no_geo OR v_perimeter IN ('anywhere', 'all') THEN true
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

COMMENT ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[], text) IS
  'Accueil / Découvrir. France : country_code FR. International : pas de gate pays, zone continent optionnelle.';

REVOKE ALL ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[], text) TO service_role;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

