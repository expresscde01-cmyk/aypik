-- Un compte bloqué (login_security.locked_at) peut recevoir le jeton d'un lien
-- de récupération déjà vérifié, le temps de choisir un nouveau mot de passe.
-- Le déblocage lui-même reste unlock_login_security(), après updateUser.
--
-- Doc Custom Access Token Hook : authentication_method distingue "recovery".
-- https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
-- GoTrue verifyPost (POST /verify, dont verifyOtp type=recovery) passe
-- models.OTP : le hook reçoit "otp", pas "recovery". "recovery" est envoyé
-- à l'échange de code PKCE quand le flux a été créé comme récupération.
-- On n'accepte "otp" que si le jeton de récupération vient d'être consommé
-- (recovery_sent_at dans l'heure, recovery_token vide). password,
-- token_refresh et toute autre méthode restent refusés.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  uid uuid;
  locked timestamptz;
  method text;
  recovery_sent timestamptz;
  recovery_token text;
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

  IF locked IS NULL THEN
    RETURN event;
  END IF;

  method := coalesce(event->>'authentication_method', '');

  IF method = 'recovery' THEN
    RETURN event;
  END IF;

  IF method = 'otp' THEN
    SELECT u.recovery_sent_at, u.recovery_token
      INTO recovery_sent, recovery_token
    FROM auth.users u
    WHERE u.id = uid;

    IF recovery_sent IS NOT NULL
       AND recovery_sent > now() - interval '1 hour'
       AND coalesce(recovery_token, '') = '' THEN
      RETURN event;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'account_locked'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
