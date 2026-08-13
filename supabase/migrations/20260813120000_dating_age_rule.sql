-- Half-plus-seven: min partner age = floor(viewer_age / 2) + 7.
-- A viewer must never see or interact with a profile younger than that.
-- Integer division in PostgreSQL is floor for positive ages.

CREATE OR REPLACE FUNCTION public.profile_age(p_birth date)
RETURNS integer
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_birth IS NULL THEN NULL
    ELSE EXTRACT(YEAR FROM age(current_date, p_birth))::integer
  END;
$$;

CREATE OR REPLACE FUNCTION public.min_partner_age(p_age integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_age IS NULL THEN NULL
    ELSE (p_age / 2) + 7
  END;
$$;

-- True iff partner_age >= floor(viewer_age / 2) + 7
CREATE OR REPLACE FUNCTION public.dating_partner_old_enough(
  p_viewer_birth date,
  p_partner_birth date
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT
    p_viewer_birth IS NOT NULL
    AND p_partner_birth IS NOT NULL
    AND public.profile_age(p_partner_birth)
        >= public.min_partner_age(public.profile_age(p_viewer_birth));
$$;

REVOKE ALL ON FUNCTION public.profile_age(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.min_partner_age(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dating_partner_old_enough(date, date) FROM PUBLIC;

-- ===== likes: cannot target a too-young profile =====
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

  IF NOT public.dating_partner_old_enough(from_birth, to_birth) THEN
    RAISE EXCEPTION 'age_rule_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS likes_enforce_dating_age ON likes;
CREATE TRIGGER likes_enforce_dating_age
BEFORE INSERT ON likes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_dating_age_on_like();
