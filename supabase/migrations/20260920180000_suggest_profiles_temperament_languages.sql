-- Filtres Découvrir : tempérament (jsonb par famille) et langues parlées.
-- DROP de l’ancienne signature à 13 paramètres, puis CREATE à 16.
-- Pas de GRANT sur profiles. Sortie inchangée (pas de birth_date, last_active_at, lat, lng, deletion_requested_at).

DROP FUNCTION IF EXISTS public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamp with time zone, uuid[], text[], text[], text, text[]);
DROP FUNCTION IF EXISTS public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamp with time zone, uuid[], text[], text[], text, text[], jsonb, text[], text);

CREATE FUNCTION public.suggest_profiles(p_limit integer DEFAULT 20, p_same_city_only boolean DEFAULT false, p_min_interest_overlap integer DEFAULT 0, p_mode text DEFAULT 'home'::text, p_geo_perimeter text DEFAULT NULL::text, p_radius_km numeric DEFAULT NULL::numeric, p_sort text DEFAULT NULL::text, p_created_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_exclude_ids uuid[] DEFAULT '{}'::uuid[], p_world_zones text[] DEFAULT NULL::text[], p_france_world_codes text[] DEFAULT NULL::text[], p_international_country text DEFAULT NULL::text, p_international_countries text[] DEFAULT NULL::text[], p_temperament jsonb DEFAULT NULL::jsonb, p_languages text[] DEFAULT NULL::text[], p_min_language_level text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, display_name text, bio text, has_children boolean, location text, interests text[], photo_url text, gender text, created_at timestamp with time zone, updated_at timestamp with time zone, score numeric, mutual_interest_count integer, same_city boolean, same_department boolean, same_region boolean, neighboring_region boolean, age integer, is_boosted boolean, distance_km numeric, activity_score integer, is_founder boolean, founder_number integer, is_online boolean, country_code text, city_name text, world_zone text, discover_mode text, open_messaging boolean)
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
  v_exclusive boolean := false;
  v_no_geo boolean := false;
  v_international boolean := false;
  v_french_world boolean := false;
  v_worldwide boolean := true;
  v_world_zones text[] := '{}';
  v_france_world_codes text[] := '{}';
  v_international_country text := NULL;
  v_international_countries text[] := '{}';
  v_sort text;
  v_limit integer;
  v_radius numeric;
  v_can_filter boolean := false;
  v_temp_active boolean := false;
  v_temp_budget integer := 30;
  v_temp_energy text[] := '{}';
  v_temp_social text[] := '{}';
  v_temp_communication text[] := '{}';
  v_temp_heart text[] := '{}';
  v_temp_mind text[] := '{}';
  v_temp_attitude text[] := '{}';
  v_lang_codes text[] := '{}';
  v_min_lang_rank integer := 1;
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

  SELECT c.geo_perimeter, c.min_overlap
    INTO v_perimeter, min_overlap
  FROM public.offer_clamp_discover_args(
    me,
    CASE WHEN v_exclusive THEN v_perimeter || '__x' ELSE v_perimeter END,
    min_overlap
  ) AS c;
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
  v_international_country := NULLIF(upper(trim(COALESCE(p_international_country, ''))), '');
  IF v_international_country IS NOT NULL AND length(v_international_country) <> 2 THEN
    v_international_country := NULL;
  END IF;
  SELECT COALESCE(array_agg(upper(trim(c))), '{}'::text[])
    INTO v_international_countries
  FROM unnest(COALESCE(p_international_countries, '{}'::text[])) AS c
  WHERE length(trim(c)) = 2;
  v_international_countries := COALESCE(v_international_countries, '{}'::text[]);
  IF cardinality(v_international_countries) = 0 AND v_international_country IS NOT NULL THEN
    v_international_countries := ARRAY[v_international_country];
  END IF;
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

  -- Même règle que centres d'intérêt : si l'offre ne personnalise pas la
  -- recherche, offer_clamp_discover_args force min_overlap à 0. Ici on ignore
  -- aussi tempérament / langues (offer_clamp_discover_args inchangé).
  v_can_filter := public.offer_can_personalize_search(me);
  IF v_can_filter AND p_temperament IS NOT NULL AND jsonb_typeof(p_temperament) = 'object' THEN
    SELECT COALESCE(array_agg(x), '{}'::text[]) INTO v_temp_energy
    FROM (
      SELECT k AS x FROM (
        SELECT DISTINCT k
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_temperament->'energy') = 'array' THEN p_temperament->'energy' ELSE '[]'::jsonb END) AS k
        WHERE k IN ('calm', 'settled', 'dynamic', 'hyper')
      ) d
      LIMIT v_temp_budget
    ) s;
    v_temp_energy := COALESCE(v_temp_energy, '{}'::text[]);
    v_temp_budget := v_temp_budget - COALESCE(cardinality(v_temp_energy), 0);

    SELECT COALESCE(array_agg(x), '{}'::text[]) INTO v_temp_social
    FROM (
      SELECT k AS x FROM (
        SELECT DISTINCT k
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_temperament->'social') = 'array' THEN p_temperament->'social' ELSE '[]'::jsonb END) AS k
        WHERE k IN ('homebody', 'introvert', 'sociable', 'extrovert', 'needs_company')
      ) d
      LIMIT GREATEST(v_temp_budget, 0)
    ) s;
    v_temp_social := COALESCE(v_temp_social, '{}'::text[]);
    v_temp_budget := v_temp_budget - COALESCE(cardinality(v_temp_social), 0);

    SELECT COALESCE(array_agg(x), '{}'::text[]) INTO v_temp_communication
    FROM (
      SELECT k AS x FROM (
        SELECT DISTINCT k
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_temperament->'communication') = 'array' THEN p_temperament->'communication' ELSE '[]'::jsonb END) AS k
        WHERE k IN ('discreet', 'listener', 'communicative', 'talkative')
      ) d
      LIMIT GREATEST(v_temp_budget, 0)
    ) s;
    v_temp_communication := COALESCE(v_temp_communication, '{}'::text[]);
    v_temp_budget := v_temp_budget - COALESCE(cardinality(v_temp_communication), 0);

    SELECT COALESCE(array_agg(x), '{}'::text[]) INTO v_temp_heart
    FROM (
      SELECT k AS x FROM (
        SELECT DISTINCT k
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_temperament->'heart') = 'array' THEN p_temperament->'heart' ELSE '[]'::jsonb END) AS k
        WHERE k IN ('distant', 'empathic', 'sensitive', 'tender', 'warm', 'romantic')
      ) d
      LIMIT GREATEST(v_temp_budget, 0)
    ) s;
    v_temp_heart := COALESCE(v_temp_heart, '{}'::text[]);
    v_temp_budget := v_temp_budget - COALESCE(cardinality(v_temp_heart), 0);

    SELECT COALESCE(array_agg(x), '{}'::text[]) INTO v_temp_mind
    FROM (
      SELECT k AS x FROM (
        SELECT DISTINCT k
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_temperament->'mind') = 'array' THEN p_temperament->'mind' ELSE '[]'::jsonb END) AS k
        WHERE k IN ('rational', 'thinker', 'curious', 'creative', 'funny')
      ) d
      LIMIT GREATEST(v_temp_budget, 0)
    ) s;
    v_temp_mind := COALESCE(v_temp_mind, '{}'::text[]);
    v_temp_budget := v_temp_budget - COALESCE(cardinality(v_temp_mind), 0);

    SELECT COALESCE(array_agg(x), '{}'::text[]) INTO v_temp_attitude
    FROM (
      SELECT k AS x FROM (
        SELECT DISTINCT k
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_temperament->'attitude') = 'array' THEN p_temperament->'attitude' ELSE '[]'::jsonb END) AS k
        WHERE k IN ('organized', 'mature', 'spontaneous', 'adventurous', 'carefree')
      ) d
      LIMIT GREATEST(v_temp_budget, 0)
    ) s;
    v_temp_attitude := COALESCE(v_temp_attitude, '{}'::text[]);
  END IF;
  v_temp_active :=
    COALESCE(cardinality(v_temp_energy), 0)
    + COALESCE(cardinality(v_temp_social), 0)
    + COALESCE(cardinality(v_temp_communication), 0)
    + COALESCE(cardinality(v_temp_heart), 0)
    + COALESCE(cardinality(v_temp_mind), 0)
    + COALESCE(cardinality(v_temp_attitude), 0) > 0;

  IF v_can_filter THEN
    SELECT COALESCE(array_agg(c), '{}'::text[]) INTO v_lang_codes
    FROM (
      SELECT DISTINCT lower(trim(raw)) AS c
      FROM unnest(COALESCE(p_languages, '{}'::text[])) AS raw
      WHERE length(trim(raw)) = 2
        AND lower(trim(raw)) = ANY (ARRAY['aa','ab','ae','af','ak','am','an','ar','as','av','ay','az','ba','be','bg','bh','bi','bm','bn','bo','br','bs','ca','ce','ch','co','cr','cs','cu','cv','cy','da','de','dv','dz','ee','el','en','eo','es','et','eu','fa','ff','fi','fj','fo','fr','fy','ga','gd','gl','gn','gu','gv','ha','he','hi','ho','hr','ht','hu','hy','hz','ia','id','ie','ig','ii','ik','io','is','it','iu','ja','jv','ka','kg','ki','kj','kk','kl','km','kn','ko','kr','ks','ku','kv','kw','ky','la','lb','lg','li','ln','lo','lt','lu','lv','mg','mh','mi','mk','ml','mn','mr','ms','mt','my','na','nb','nd','ne','ng','nl','nn','no','nr','nv','ny','oc','oj','om','or','os','pa','pi','pl','ps','pt','qu','rm','rn','ro','ru','rw','sa','sc','sd','se','sg','si','sk','sl','sm','sn','so','sq','sr','ss','st','su','sv','sw','ta','te','tg','th','ti','tk','tl','tn','to','tr','ts','tt','tw','ty','ug','uk','ur','uz','ve','vi','vo','wa','wo','xh','yi','yo','za','zh','zu']::text[])
      LIMIT 8
    ) s;
    v_lang_codes := COALESCE(v_lang_codes, '{}'::text[]);
    v_min_lang_rank := CASE lower(trim(COALESCE(p_min_language_level, '')))
      WHEN 'intermediate' THEN 2
      WHEN 'advanced' THEN 3
      WHEN 'native' THEN 4
      ELSE 1
    END;
  END IF;

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
    UNION
    -- Passés en Découvrir : 2 mois.
    SELECT dp.to_user
    FROM public.discovery_passes dp
    WHERE dp.from_user = me
      AND dp.created_at >= (now() - interval '2 months')
    UNION
    -- Matchs rompus : 1 an si au moins un message échangé, sinon 6 mois.
    SELECT mb.peer_id
    FROM public.match_breaks mb
    WHERE mb.user_id = me
      AND mb.action = 'break'
      AND mb.created_at >= (
        now() - (
          CASE
            WHEN EXISTS (
              SELECT 1 FROM public.messages m
              WHERE (m.sender_id = me AND m.recipient_id = mb.peer_id)
                 OR (m.sender_id = mb.peer_id AND m.recipient_id = me)
            ) THEN interval '1 year'
            ELSE interval '6 months'
          END
        )
      )
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
        (my_gender = 'homme' AND p.gender = 'femme')
        OR (my_gender = 'femme' AND p.gender = 'homme')
      )
      AND (
        min_overlap <= 0
        OR COALESCE(p.interests, '{}') && my_interests
      )
      AND (
        NOT v_temp_active
        OR (
          COALESCE(cardinality(p.temperament), 0) > 0
          AND (cardinality(v_temp_energy) = 0 OR p.temperament && v_temp_energy)
          AND (cardinality(v_temp_social) = 0 OR p.temperament && v_temp_social)
          AND (cardinality(v_temp_communication) = 0 OR p.temperament && v_temp_communication)
          AND (cardinality(v_temp_heart) = 0 OR p.temperament && v_temp_heart)
          AND (cardinality(v_temp_mind) = 0 OR p.temperament && v_temp_mind)
          AND (cardinality(v_temp_attitude) = 0 OR p.temperament && v_temp_attitude)
        )
      )
      AND (
        cardinality(v_lang_codes) = 0
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p.languages) = 'array' THEN p.languages ELSE '[]'::jsonb END
          ) AS lang
          WHERE jsonb_typeof(lang) = 'object'
            AND lower(trim(COALESCE(lang->>'code', ''))) = ANY (v_lang_codes)
            AND CASE lower(trim(COALESCE(lang->>'level', '')))
              WHEN 'beginner' THEN 1
              WHEN 'intermediate' THEN 2
              WHEN 'advanced' THEN 3
              WHEN 'native' THEN 4
              ELSE 0
            END >= v_min_lang_rank
        )
      )
      AND (p_created_after IS NULL OR p.created_at >= p_created_after)
      AND (
        (
          v_international
          AND COALESCE(p.country_code, 'FR') <> 'FR'
          AND COALESCE(p.country_code, 'FR') NOT IN (
            SELECT iso2 FROM public.world_countries WHERE is_french_territory
          )
          AND (
            cardinality(v_international_countries) = 0
            OR COALESCE(p.country_code, 'FR') = ANY (v_international_countries)
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
        OR cardinality(v_international_countries) > 0
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
    CASE
      WHEN g.incognito_at IS NOT NULL THEN 0
      ELSE EXTRACT(EPOCH FROM COALESCE(g.last_active_at, g.updated_at, g.created_at))::integer
    END,
    g.founder,
    g.founder_num::integer,
    public.profile_is_online_for_viewer(g.incognito_at, g.last_active_at),
    g.cand_country,
    g.cand_city_name,
    g.cand_world_zone,
    g.discover_mode,
    public.is_open_messaging_profile(g.id)
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

GRANT EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamp with time zone, uuid[], text[], text[], text, text[], jsonb, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamp with time zone, uuid[], text[], text[], text, text[], jsonb, text[], text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamp with time zone, uuid[], text[], text[], text, text[], jsonb, text[], text) FROM anon, public;

NOTIFY pgrst, 'reload schema';

-- Contrôle : une seule suggest_profiles (aucune surcharge)
-- SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'suggest_profiles';

