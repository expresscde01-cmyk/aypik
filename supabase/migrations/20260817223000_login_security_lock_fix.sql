-- Correctif blocage connexion : FORCE RLS empêchait l’INSERT du compteur,
-- et la fonction imbriquée login_security_user_id n’était pas exécutable.
-- Lookup auth.users en ligne + 4e échec → locked_at.

ALTER TABLE public.login_security NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.login_security ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.login_security FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.login_security TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.record_login_failure(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid;
  attempts integer := 0;
  locked timestamptz;
  just_locked boolean := false;
  normalized text := lower(btrim(COALESCE(p_email, '')));
BEGIN
  IF normalized = '' THEN
    RETURN jsonb_build_object('ok', true, 'locked', false, 'just_locked', false, 'attempts', 0);
  END IF;

  SELECT u.id INTO uid
  FROM auth.users u
  WHERE lower(u.email) = normalized
  LIMIT 1;

  IF uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'locked', false,
      'just_locked', false,
      'attempts', 0
    );
  END IF;

  INSERT INTO public.login_security (user_id, failed_attempts, last_failed_at, updated_at)
  VALUES (uid, 1, now(), now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    failed_attempts = CASE
      WHEN public.login_security.locked_at IS NOT NULL
        THEN public.login_security.failed_attempts
      ELSE LEAST(public.login_security.failed_attempts + 1, 20)
    END,
    last_failed_at = now(),
    updated_at = now()
  RETURNING failed_attempts, locked_at INTO attempts, locked;

  IF locked IS NULL AND attempts >= 4 THEN
    UPDATE public.login_security
    SET locked_at = now(), updated_at = now()
    WHERE user_id = uid
      AND locked_at IS NULL
    RETURNING locked_at INTO locked;
    just_locked := locked IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'locked', locked IS NOT NULL,
    'just_locked', just_locked,
    'attempts', attempts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.login_security_status(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid;
  locked timestamptz;
  normalized text := lower(btrim(COALESCE(p_email, '')));
BEGIN
  IF normalized = '' THEN
    RETURN jsonb_build_object('ok', true, 'locked', false);
  END IF;

  SELECT u.id INTO uid
  FROM auth.users u
  WHERE lower(u.email) = normalized
  LIMIT 1;

  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'locked', false);
  END IF;

  SELECT s.locked_at INTO locked
  FROM public.login_security s
  WHERE s.user_id = uid;

  RETURN jsonb_build_object(
    'ok', true,
    'locked', locked IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_login_failure(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_security_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_login_failure(text) TO anon, authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.login_security_status(text) TO anon, authenticated, postgres, service_role;

NOTIFY pgrst, 'reload schema';
