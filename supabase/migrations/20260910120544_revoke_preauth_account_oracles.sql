-- Ferme les oracles pré-auth : record_login_failure / email_is_registered /
-- login_security_status ne sont plus exécutables en anon/authenticated.
-- L’incrément d’échecs et le reset passent par l’Edge Function login-security
-- (service_role), après un vrai signInWithPassword (CAPTCHA GoTrue).

CREATE OR REPLACE FUNCTION public.clear_login_failures_for_email(p_email text)
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

  IF locked IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'locked', true);
  END IF;

  UPDATE public.login_security
  SET failed_attempts = 0, last_failed_at = NULL, updated_at = now()
  WHERE user_id = uid;

  RETURN jsonb_build_object('ok', true, 'locked', false);
END;
$$;

COMMENT ON FUNCTION public.clear_login_failures_for_email(text) IS
  'Reset du compteur d’échecs après une connexion réussie. Appel service_role uniquement (Edge Function login-security).';

-- Retire le throttle 30s : plus nécessaire une fois la RPC hors d’anon.
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

COMMENT ON FUNCTION public.record_login_failure(text) IS
  'Incrémente les échecs de mot de passe. Appel service_role uniquement, depuis l’Edge Function login-security après un vrai échec GoTrue.';

REVOKE ALL ON FUNCTION public.clear_login_failures_for_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_login_failure(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.login_security_status(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_is_registered(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.login_security_lock_payload(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_login_lock_email_sent(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.clear_login_failures_for_email(text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.record_login_failure(text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.login_security_status(text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.email_is_registered(text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.login_security_lock_payload(text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.mark_login_lock_email_sent(uuid) TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
