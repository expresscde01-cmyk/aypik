-- Réconciliation d'historique : la table public.login_security et ces fonctions
-- ont été créées à l'origine via des requêtes SQL Editor jamais suivies par une
-- migration trackée (aucune entrée schema_migrations pour cette période). Cette
-- migration ne fait que documenter fidèlement l'état déjà en place, avec le
-- search_path déjà durci aujourd'hui (migration harden_search_path_and_trigger_grants).
--
-- IMPORTANT : ne touche PAS à record_login_failure, login_security_status, ni
-- clear_login_failures_for_email — ces trois restent uniquement définies par
-- leurs propres migrations (throttle_record_login_failure, add_password_verification_hook,
-- harden_..., shorten_..., revoke_preauth_account_oracles) pour ne pas régresser
-- le correctif de sécurité du 2026-09-10.

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
  'Compteur d''échecs mot de passe et blocage temporaire (4 tentatives).';

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
SET search_path = public
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

REVOKE ALL ON FUNCTION public.clear_login_failures() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlock_login_security() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.login_security_is_locked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_login_failures() TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.unlock_login_security() TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.login_security_is_locked() TO authenticated, postgres, service_role;

-- Lecture interne pour l'Edge Function (e-mail d'alerte). Grants déjà correctement
-- restreints par revoke_preauth_account_oracles (2026-09-10) : on ne les retouche pas ici.
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

-- Hook optionnel (Dashboard Auth > Hooks > Custom Access Token) pour refuser un
-- jeton si le compte est bloqué. search_path déjà figé aujourd'hui, reconduit ici.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
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
