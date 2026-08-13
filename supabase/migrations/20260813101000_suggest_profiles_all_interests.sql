-- p_min_interest_overlap = -1 : tous les centres d’intérêt du visiteur
-- doivent être en commun (overlap >= cardinality(my_interests)).
-- 0 = pas de filtre ; 1/2/3 = minimum.

CREATE OR REPLACE FUNCTION suggest_profiles(
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
  created_at timestamptz,
  updated_at timestamptz,
  score numeric,
  mutual_interest_count integer,
  same_city boolean,
  same_department boolean,
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
  my_interests text[];
  min_overlap integer;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT p.birth_date, p.location, COALESCE(p.interests, '{}')
  INTO my_birth, my_location, my_interests
  FROM profiles p
  WHERE p.id = me;

  IF my_birth IS NULL THEN
    RETURN;
  END IF;

  my_age := EXTRACT(YEAR FROM age(current_date, my_birth))::integer;
  my_min_age := (my_age / 2) + 7;

  my_city := lower(trim(regexp_replace(COALESCE(my_location, ''), '\s*\(.*$', '')));
  my_dept := substring(COALESCE(my_location, '') from '\((\d{2})');

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
      EXTRACT(YEAR FROM age(current_date, p.birth_date))::integer AS cand_age,
      (
        SELECT COUNT(*)::integer
        FROM unnest(COALESCE(p.interests, '{}')) i
        WHERE i = ANY (my_interests)
      ) AS overlap,
      lower(trim(regexp_replace(COALESCE(p.location, ''), '\s*\(.*$', ''))) AS cand_city,
      substring(COALESCE(p.location, '') from '\((\d{2})') AS cand_dept,
      EXISTS (
        SELECT 1 FROM profile_boosts b
        WHERE b.user_id = p.id
          AND b.payment_status IN ('paid', 'simulated')
          AND b.ends_at > now()
      ) AS boosted
    FROM profiles p
    WHERE p.id <> me
      AND p.has_children = false
      AND p.id NOT IN (SELECT uid FROM liked)
      AND p.id NOT IN (SELECT uid FROM flashed)
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
            ELSE 0
          END
        + GREATEST(0, 20 - ABS(c.cand_age - my_age))::numeric
        + CASE WHEN c.boosted THEN 25 ELSE 0 END
      ) AS rank_score,
      (COALESCE(my_location, '') <> '' AND c.location = my_location)
        OR (my_city <> '' AND c.cand_city = my_city) AS city_match,
      (my_dept IS NOT NULL AND c.cand_dept = my_dept) AS dept_match
    FROM candidates c
    WHERE c.cand_age >= my_min_age
      AND my_age >= ((c.cand_age / 2) + 7)
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
    s.created_at,
    s.updated_at,
    s.rank_score,
    s.overlap,
    s.city_match,
    s.dept_match,
    s.cand_age,
    s.boosted
  FROM scored s
  ORDER BY s.rank_score DESC, s.boosted DESC, s.created_at DESC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 20), 50), 1);
END;
$$;

REVOKE ALL ON FUNCTION suggest_profiles(integer, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION suggest_profiles(integer, boolean, integer) TO authenticated;
