-- Suppression de compte : délai de grâce 30 jours (tous les comptes, Fondateurs inclus).
-- Demande → deletion_requested_at ; reconnexion = annulation possible ;
-- après 30 jours → wipe intégral (is_founder + founder_number, pas de ghost).
-- Les numéros ne sont jamais réattribués (séquence + MAX+1).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

COMMENT ON COLUMN public.profiles.deletion_requested_at IS
  'Demande de suppression RGPD. NULL = compte actif. Après 30 jours : purge définitive.';

CREATE INDEX IF NOT EXISTS profiles_deletion_requested_at_idx
  ON public.profiles (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;

-- Empêche le client de poser / effacer le timestamp hors RPC SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.protect_deletion_requested_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('aypik.allow_deletion_ts', true) IS DISTINCT FROM '1' THEN
      NEW.deletion_requested_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at THEN
    IF current_setting('aypik.allow_deletion_ts', true) IS DISTINCT FROM '1' THEN
      NEW.deletion_requested_at := OLD.deletion_requested_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_deletion_requested_at ON public.profiles;
CREATE TRIGGER profiles_protect_deletion_requested_at
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_deletion_requested_at();

-- Masquer les comptes en cours de suppression dans Découvrir (sauf soi-même).
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all"
ON public.profiles FOR SELECT
TO authenticated
USING (
  deletion_requested_at IS NULL
  OR id = auth.uid()
);

-- ===== Wipe interne (mêmes effets que l’ancien delete_account) =====
CREATE OR REPLACE FUNCTION public.purge_user_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Wipe explicite du statut Fondateur (is_founder + founder_number).
  -- Le reste suit via ON DELETE CASCADE depuis auth.users.
  DELETE FROM public.memberships WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_user_account(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_deletions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT id
    FROM public.profiles
    WHERE deletion_requested_at IS NOT NULL
      AND deletion_requested_at <= now() - interval '30 days'
  LOOP
    PERFORM public.purge_user_account(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_deletions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_deletions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_deletions() TO service_role;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  requested_at timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM public.purge_expired_deletions();

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  PERFORM set_config('aypik.allow_deletion_ts', '1', true);

  UPDATE public.profiles
  SET deletion_requested_at = COALESCE(deletion_requested_at, now())
  WHERE id = uid
  RETURNING deletion_requested_at INTO requested_at;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'pending_deletion',
    'deletion_requested_at', requested_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM public.purge_expired_deletions();

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  -- Trop tard : le délai est écoulé → purge (plus d’annulation).
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid
      AND deletion_requested_at IS NOT NULL
      AND deletion_requested_at <= now() - interval '30 days'
  ) THEN
    PERFORM public.purge_user_account(uid);
    RAISE EXCEPTION 'deletion_already_processed';
  END IF;

  PERFORM set_config('aypik.allow_deletion_ts', '1', true);

  UPDATE public.profiles
  SET deletion_requested_at = NULL
  WHERE id = uid;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'active',
    'deletion_requested_at', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_account_deletion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;

-- Ancien RPC : plus de wipe immédiat — même délai de 30 jours.
CREATE OR REPLACE FUNCTION public.delete_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.request_account_deletion();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_account() TO authenticated;

-- ===== Découvrir / suggestions : ignorer les comptes en cours de suppression =====
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

-- Pas de like / flash vers un compte en cours de suppression.
CREATE OR REPLACE FUNCTION public.enforce_active_account_on_social()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending timestamptz;
BEGIN
  SELECT deletion_requested_at INTO pending
  FROM public.profiles
  WHERE id = NEW.to_user;

  IF pending IS NOT NULL THEN
    RAISE EXCEPTION 'account_pending_deletion';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS likes_enforce_active_account ON public.likes;
CREATE TRIGGER likes_enforce_active_account
BEFORE INSERT ON public.likes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_active_account_on_social();

DROP TRIGGER IF EXISTS flashes_enforce_active_account ON public.flashes;
CREATE TRIGGER flashes_enforce_active_account
BEFORE INSERT ON public.flashes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_active_account_on_social();

-- Purge quotidienne via pg_cron (schéma cron, pas le schéma de l’extension).
-- Fallback : purge opportuniste via purge_expired_deletions() à chaque login.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron non disponible : %', SQLERRM;
  END;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'Fallback : appeler public.purge_expired_deletions() à chaque login (RPC authentifié).';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule(j.jobid)
    FROM cron.job j
    WHERE j.jobname = 'purge-expired-account-deletions';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    PERFORM cron.schedule(
      'purge-expired-account-deletions',
      '15 3 * * *',
      'SELECT public.purge_expired_deletions()'
    );
    RAISE NOTICE 'pg_cron : job purge-expired-account-deletions planifié (03:15 UTC).';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Impossible de planifier pg_cron : %', SQLERRM;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
