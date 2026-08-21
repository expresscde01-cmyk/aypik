-- Sécurité connexion — coller TOUT ce fichier dans l'éditeur SQL Supabase, puis Run.
-- Correctif : 4 échecs consécutifs bloquent vraiment le compte.
-- Puis : supabase functions deploy login-security
-- Sécurité connexion : 4 mots de passe faux consécutifs → blocage
-- jusqu’à réinitialisation. L’e-mail d’alerte part via l’Edge Function
-- login-security. Le déblocage se fait après changement de mot de passe.

CREATE TABLE IF NOT EXISTS public.login_security (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_attempts integer NOT NULL DEFAULT 0
    CHECK (failed_attempts >= 0 AND failed_attempts <= 20),
  locked_at timestamptz,
  lock_email_sent_at timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.login_security IS
  'Compteur d’échecs mot de passe et blocage temporaire (4 tentatives).';

ALTER TABLE public.login_security ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.login_security FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.login_security TO postgres, service_role;
GRANT SELECT ON public.login_security TO supabase_auth_admin;

DROP POLICY IF EXISTS "login_security_auth_admin_select" ON public.login_security;
CREATE POLICY "login_security_auth_admin_select"
ON public.login_security FOR SELECT
TO supabase_auth_admin
USING (true);

CREATE OR REPLACE FUNCTION public.normalize_login_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(COALESCE(p_email, '')));
$$;

CREATE OR REPLACE FUNCTION public.login_security_user_id(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(email) = public.normalize_login_email(p_email)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.login_security_user_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_security_user_id(text) TO postgres, service_role;

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

CREATE OR REPLACE FUNCTION public.clear_login_failures()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  locked timestamptz;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT locked_at INTO locked
  FROM public.login_security
  WHERE user_id = me;

  IF locked IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'locked', true);
  END IF;

  UPDATE public.login_security
  SET failed_attempts = 0, last_failed_at = NULL, updated_at = now()
  WHERE user_id = me;

  RETURN jsonb_build_object('ok', true, 'locked', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_login_security()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  INSERT INTO public.login_security (user_id, failed_attempts, updated_at)
  VALUES (me, 0, now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    failed_attempts = 0,
    locked_at = NULL,
    lock_email_sent_at = NULL,
    last_failed_at = NULL,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'locked', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.login_security_is_locked()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  locked timestamptz;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'locked', false);
  END IF;

  SELECT locked_at INTO locked
  FROM public.login_security
  WHERE user_id = me;

  RETURN jsonb_build_object('ok', true, 'locked', locked IS NOT NULL);
END;
$$;

-- Lecture interne pour l’Edge Function (e-mail d’alerte).
CREATE OR REPLACE FUNCTION public.login_security_lock_payload(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid;
  row public.login_security%ROWTYPE;
  v_email text;
  v_name text;
BEGIN
  uid := public.login_security_user_id(p_email);
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT * INTO row
  FROM public.login_security
  WHERE user_id = uid;

  IF row.user_id IS NULL OR row.locked_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_locked');
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = uid;

  SELECT p.display_name INTO v_name
  FROM public.profiles p
  WHERE p.id = uid;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', uid,
    'email', v_email,
    'display_name', COALESCE(NULLIF(btrim(v_name), ''), 'toi'),
    'locked_at', row.locked_at,
    'lock_email_sent_at', row.lock_email_sent_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_login_lock_email_sent(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.login_security
  SET lock_email_sent_at = COALESCE(lock_email_sent_at, now()),
      updated_at = now()
  WHERE user_id = p_user
    AND locked_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.login_security_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_login_failure(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_login_failures() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlock_login_security() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_security_is_locked() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_security_lock_payload(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_login_lock_email_sent(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.login_security_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_failure(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_login_failures() TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_login_security() TO authenticated;
GRANT EXECUTE ON FUNCTION public.login_security_is_locked() TO authenticated;
GRANT EXECUTE ON FUNCTION public.login_security_lock_payload(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_login_lock_email_sent(uuid) TO service_role;

-- Hook optionnel (Dashboard Auth > Hooks > Custom Access Token) pour
-- refuser un jeton si le compte est bloqué.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  uid uuid;
  locked timestamptz;
BEGIN
  BEGIN
    uid := (event->>'user_id')::uuid;
  EXCEPTION
    WHEN others THEN
      RETURN event;
  END;

  SELECT locked_at INTO locked
  FROM public.login_security
  WHERE user_id = uid;

  IF locked IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'account_locked'
      )
    );
  END IF;

  RETURN event;
END;
$$;

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

NOTIFY pgrst, 'reload schema';

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
GRANT EXECUTE ON FUNCTION public.login_security_lock_payload(text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.mark_login_lock_email_sent(uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.login_security_user_id(text) TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
