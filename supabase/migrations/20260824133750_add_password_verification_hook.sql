
-- Hook Supabase Auth "Password Verification Attempt" : déplace le comptage des échecs
-- de connexion côté serveur (appelé par GoTrue lui-même après la vérification réelle
-- du mot de passe), pour remplacer le point faible de record_login_failure(p_email)
-- (appelable directement par le client avec un email arbitraire, sans preuve d'un vrai
-- échec). Réutilise la table public.login_security déjà en place, donc
-- login_security_is_locked() / unlock_login_security() / clear_login_failures()
-- continuent de fonctionner sans changement.
--
-- IMPORTANT : cette fonction seule ne suffit pas. Il faut l'activer manuellement dans
-- le dashboard Supabase : Authentication → Hooks → "Password Verification Attempt" →
-- sélectionner public.hook_password_verification_attempt. Impossible à faire depuis
-- une migration SQL.
CREATE OR REPLACE FUNCTION public.hook_password_verification_attempt(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  uid uuid := (event->>'user_id')::uuid;
  is_valid boolean := (event->'valid')::boolean;
  attempts integer := 0;
  locked timestamptz;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('decision', 'continue');
  END IF;

  IF is_valid THEN
    -- Mot de passe correct : ne pas incrémenter, ne pas déverrouiller
    -- automatiquement (le déverrouillage reste un choix explicite via
    -- unlock_login_security(), par ex. après un lien reçu par email).
    UPDATE public.login_security
    SET failed_attempts = 0,
        last_failed_at = NULL,
        updated_at = now()
    WHERE user_id = uid
      AND locked_at IS NULL;

    RETURN jsonb_build_object('decision', 'continue');
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
  END IF;

  IF locked IS NOT NULL THEN
    RETURN jsonb_build_object(
      'decision', 'reject',
      'message', 'Trop de tentatives échouées. Ton compte est temporairement verrouillé — vérifie tes emails pour le déverrouiller.',
      'should_logout_user', false
    );
  END IF;

  RETURN jsonb_build_object('decision', 'continue');
END;
$$;

GRANT EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb) FROM authenticated, anon, public;

GRANT SELECT, INSERT, UPDATE ON TABLE public.login_security TO supabase_auth_admin;

NOTIFY pgrst, 'reload schema';
