-- Genre optionnel (homme | femme), verrouillé dès la première valeur,
-- et filtrage des suggestions : homme → femmes, femme → hommes, NULL → tous.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text;

COMMENT ON COLUMN public.profiles.gender IS
  'Optionnel. Valeurs FR alignées UI : homme | femme. NULL = non renseigné (voit tout le monde). Une fois défini, immuable (protect_profile_gender).';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_gender_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check
  CHECK (gender IS NULL OR gender IN ('homme', 'femme'));

-- NULL → une valeur autorisée ; ensuite ni changement ni remise à NULL.
CREATE OR REPLACE FUNCTION public.protect_profile_gender()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.gender IS NOT NULL THEN
    NEW.gender := OLD.gender;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_profile_gender ON public.profiles;
CREATE TRIGGER profiles_protect_profile_gender
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_gender();

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
      public.profile_age(p.birth_date) AS cand_age,
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
            ELSE 0
          END
        + GREATEST(0, 20 - ABS(c.cand_age - my_age))::numeric
        + CASE WHEN c.boosted THEN 25 ELSE 0 END
      ) AS rank_score,
      (COALESCE(my_location, '') <> '' AND c.location = my_location)
        OR (my_city <> '' AND c.cand_city = my_city) AS city_match,
      (my_dept IS NOT NULL AND c.cand_dept = my_dept) AS dept_match
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

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
