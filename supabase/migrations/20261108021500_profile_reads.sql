-- Étape 2, suite : lecture des profils.
-- Ligne complète : seulement son titulaire.
-- Fiches des autres : card_profiles et suggest_profiles.
-- Plafond : 5 000 fiches par minute, 25 000 fiches par jour.
-- suggest_profiles_core n'est pas appelable par le site.
-- Un dépassement ne lève pas d'erreur : la ligne du journal resterait sinon annulée.
-- La fonction renvoie 0 ligne et pose l'en-tête X-Aypik-Profile-Read.

CREATE TABLE public.profile_read_windows (
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('minute', 'day')),
  window_start timestamptz NOT NULL,
  fiches integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, kind, window_start)
);

CREATE INDEX profile_read_windows_kind_window_start_idx
  ON public.profile_read_windows (kind, window_start);

ALTER TABLE public.profile_read_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profile_read_windows FROM PUBLIC, anon, authenticated;

CREATE TABLE public.profile_read_limit_hits (
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('minute', 'day')),
  at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_read_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profile_read_limit_hits FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.consume_profile_read(p_fiches integer)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  minute_n integer;
  day_n integer;
  blocked boolean := false;
BEGIN
  IF uid IS NULL OR p_fiches IS NULL OR p_fiches <= 0 THEN
    RETURN true;
  END IF;

  IF random() < 0.01 THEN
    DELETE FROM public.profile_read_windows
    WHERE (kind = 'minute' AND window_start < now() - interval '2 hours')
       OR (kind = 'day' AND window_start < now() - interval '3 days');
  END IF;

  SELECT fiches INTO minute_n
  FROM public.profile_read_windows
  WHERE user_id = uid AND kind = 'minute' AND window_start = minute_start;
  SELECT fiches INTO day_n
  FROM public.profile_read_windows
  WHERE user_id = uid AND kind = 'day' AND window_start = day_start;
  minute_n := COALESCE(minute_n, 0);
  day_n := COALESCE(day_n, 0);

  IF minute_n + p_fiches > 5000 THEN
    INSERT INTO public.profile_read_limit_hits (user_id, kind, at)
    VALUES (uid, 'minute', now());
    blocked := true;
  END IF;
  IF day_n + p_fiches > 25000 THEN
    INSERT INTO public.profile_read_limit_hits (user_id, kind, at)
    VALUES (uid, 'day', now());
    blocked := true;
  END IF;
  IF blocked THEN
    RETURN false;
  END IF;

  INSERT INTO public.profile_read_windows (user_id, kind, window_start, fiches)
  VALUES (uid, 'minute', minute_start, p_fiches)
  ON CONFLICT (user_id, kind, window_start)
  DO UPDATE SET fiches = public.profile_read_windows.fiches + EXCLUDED.fiches;

  INSERT INTO public.profile_read_windows (user_id, kind, window_start, fiches)
  VALUES (uid, 'day', day_start, p_fiches)
  ON CONFLICT (user_id, kind, window_start)
  DO UPDATE SET fiches = public.profile_read_windows.fiches + EXCLUDED.fiches;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_profile_read(integer) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = id);

-- Vrai aussi pour un autre compte : les contrôles internes (message, like)
-- restent justes. Le site ne peut plus appeler la fonction.
ALTER FUNCTION public.profile_is_deactivated(uuid) SECURITY DEFINER;
ALTER FUNCTION public.profile_is_deactivated(uuid) SET search_path = public;
REVOKE ALL ON FUNCTION public.profile_is_deactivated(uuid) FROM PUBLIC, anon, authenticated;

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
  age integer,
  country_code text,
  city_name text,
  temperament text[],
  languages jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
  allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) > 80 THEN
    RAISE EXCEPTION 'profile_read_chunk_too_large' USING ERRCODE = 'P0001';
  END IF;

  DROP TABLE IF EXISTS pg_temp.aypik_card_batch;
  CREATE TEMP TABLE aypik_card_batch ON COMMIT DROP AS
  SELECT
    p.id,
    p.display_name,
    p.bio,
    p.has_children,
    p.location,
    p.interests,
    p.photo_url,
    p.gender,
    public.profile_is_online_for_viewer(p.incognito_at, p.last_active_at) AS is_online,
    public.profile_age(p.birth_date) AS age,
    p.country_code,
    p.city_name,
    p.temperament,
    p.languages
  FROM public.profiles p
  WHERE p.id = ANY (p_ids)
    AND p.deletion_requested_at IS NULL
    AND p.paused_at IS NULL
    AND p.id NOT IN (
      SELECT h.hidden_id
      FROM public.suggestion_refuse_hidden_ids(auth.uid()) AS h
    );

  SELECT count(*) INTO n FROM pg_temp.aypik_card_batch;
  allowed := public.consume_profile_read(n);
  IF NOT allowed THEN
    PERFORM set_config(
      'response.headers',
      '[{"X-Aypik-Profile-Read":"profile_read_rate_limited"}]',
      true
    );
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.display_name,
    b.bio,
    b.has_children,
    b.location,
    b.interests,
    b.photo_url,
    b.gender,
    b.is_online,
    b.age,
    b.country_code,
    b.city_name,
    b.temperament,
    b.languages
  FROM pg_temp.aypik_card_batch b;
END;
$$;

REVOKE ALL ON FUNCTION public.card_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.card_profiles(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.card_profiles(uuid[]) IS
  'Fiche publique : id, display_name, bio, has_children, location, interests, photo_url, gender, is_online, age, country_code, city_name, temperament, languages. Pas de date de naissance, de position, d''e-mail ni de réglage.';

ALTER FUNCTION public.suggest_profiles(
  integer, boolean, integer, text, text, numeric, text, timestamp with time zone,
  uuid[], text[], text[], text, text[], jsonb, text[], text, boolean
) RENAME TO suggest_profiles_core;

REVOKE ALL ON FUNCTION public.suggest_profiles_core(
  integer, boolean, integer, text, text, numeric, text, timestamp with time zone,
  uuid[], text[], text[], text, text[], jsonb, text[], text, boolean
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.suggest_profiles(
  p_limit integer DEFAULT 20,
  p_same_city_only boolean DEFAULT false,
  p_min_interest_overlap integer DEFAULT 0,
  p_mode text DEFAULT 'home',
  p_geo_perimeter text DEFAULT NULL,
  p_radius_km numeric DEFAULT NULL,
  p_sort text DEFAULT NULL,
  p_created_after timestamp with time zone DEFAULT NULL,
  p_exclude_ids uuid[] DEFAULT '{}',
  p_world_zones text[] DEFAULT NULL,
  p_france_world_codes text[] DEFAULT NULL,
  p_international_country text DEFAULT NULL,
  p_international_countries text[] DEFAULT NULL,
  p_temperament jsonb DEFAULT NULL,
  p_languages text[] DEFAULT NULL,
  p_min_language_level text DEFAULT NULL,
  p_boosted_only boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  display_name text,
  bio text,
  has_children boolean,
  location text,
  interests text[],
  photo_url text,
  gender text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  score numeric,
  mutual_interest_count integer,
  same_city boolean,
  same_department boolean,
  same_region boolean,
  neighboring_region boolean,
  age integer,
  is_boosted boolean,
  distance_km numeric,
  activity_score integer,
  is_founder boolean,
  founder_number integer,
  is_online boolean,
  country_code text,
  city_name text,
  world_zone text,
  discover_mode text,
  open_messaging boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
  allowed boolean;
  v_limit integer;
BEGIN
  v_limit := p_limit;
  IF v_limit IS NULL OR v_limit < 1 THEN
    v_limit := 1;
  ELSIF v_limit > 500 THEN
    v_limit := 500;
  END IF;

  DROP TABLE IF EXISTS pg_temp.aypik_suggest_batch;
  CREATE TEMP TABLE aypik_suggest_batch ON COMMIT DROP AS
  SELECT *
  FROM public.suggest_profiles_core(
    v_limit,
    p_same_city_only,
    p_min_interest_overlap,
    p_mode,
    p_geo_perimeter,
    p_radius_km,
    p_sort,
    p_created_after,
    p_exclude_ids,
    p_world_zones,
    p_france_world_codes,
    p_international_country,
    p_international_countries,
    p_temperament,
    p_languages,
    p_min_language_level,
    p_boosted_only
  );

  SELECT count(*) INTO n FROM pg_temp.aypik_suggest_batch;
  allowed := public.consume_profile_read(n);
  IF NOT allowed THEN
    PERFORM set_config(
      'response.headers',
      '[{"X-Aypik-Profile-Read":"profile_read_rate_limited"}]',
      true
    );
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM pg_temp.aypik_suggest_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_profiles(
  integer, boolean, integer, text, text, numeric, text, timestamp with time zone,
  uuid[], text[], text[], text, text[], jsonb, text[], text, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_profiles(
  integer, boolean, integer, text, text, numeric, text, timestamp with time zone,
  uuid[], text[], text[], text, text[], jsonb, text[], text, boolean
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
