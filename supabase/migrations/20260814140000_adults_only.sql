-- Interdiction légale : la plateforme est réservée aux majeurs (18 ans révolus).

CREATE OR REPLACE FUNCTION public.is_adult(p_birth date)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT p_birth IS NOT NULL
     AND public.profile_age(p_birth) >= 18;
$$;

REVOKE ALL ON FUNCTION public.is_adult(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_adult(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_profile_adult()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_adult(NEW.birth_date) THEN
    RAISE EXCEPTION 'minors_not_allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_must_be_adult ON public.profiles;
CREATE TRIGGER profiles_must_be_adult
BEFORE INSERT OR UPDATE OF birth_date ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_adult();

CREATE OR REPLACE FUNCTION public.enforce_dating_age_on_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  from_birth date;
  to_birth date;
BEGIN
  SELECT birth_date INTO from_birth FROM profiles WHERE id = NEW.from_user;
  SELECT birth_date INTO to_birth FROM profiles WHERE id = NEW.to_user;

  IF from_birth IS NULL OR to_birth IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF NOT public.is_adult(from_birth) OR NOT public.is_adult(to_birth) THEN
    RAISE EXCEPTION 'minors_not_allowed';
  END IF;

  IF NOT public.dating_partner_old_enough(from_birth, to_birth) THEN
    RAISE EXCEPTION 'age_rule_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_adult_on_flash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  from_birth date;
  to_birth date;
BEGIN
  SELECT birth_date INTO from_birth FROM profiles WHERE id = NEW.from_user;
  SELECT birth_date INTO to_birth FROM profiles WHERE id = NEW.to_user;

  IF from_birth IS NULL OR to_birth IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF NOT public.is_adult(from_birth) OR NOT public.is_adult(to_birth) THEN
    RAISE EXCEPTION 'minors_not_allowed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flashes_enforce_adult ON public.flashes;
CREATE TRIGGER flashes_enforce_adult
BEFORE INSERT ON public.flashes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_adult_on_flash();

-- Accueil : ne jamais proposer un mineur (ni à un mineur).
CREATE OR REPLACE FUNCTION public.suggest_profiles(
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

  IF my_birth IS NULL OR NOT public.is_adult(my_birth) THEN
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
      AND public.is_adult(p.birth_date)
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
  WHERE s.city_match
     OR s.dept_match
     OR s.region_match
  ORDER BY s.rank_score DESC, s.boosted DESC, s.created_at DESC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 20), 50), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_profiles(integer, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_profiles(integer, boolean, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
