
-- Atténuation rapide : record_login_failure(p_email) est appelable côté client sans
-- preuve qu'un vrai échec de mot de passe a eu lieu (auth.audit_log_entries est vide,
-- pas de source fiable à croiser). En attendant une vraie solution (hook Supabase Auth
-- "Password Verification Attempt", à configurer côté dashboard), on ajoute un délai
-- minimum de 2s entre deux échecs comptés pour un même compte : casse un script qui
-- spamme les 4 appels d'un coup, sans changer le comportement pour un vrai utilisateur
-- qui échoue plusieurs fois en se trompant de mot de passe.
CREATE OR REPLACE FUNCTION public.record_login_failure(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  uid uuid;
  attempts integer := 0;
  locked timestamptz;
  just_locked boolean := false;
  normalized text := lower(btrim(COALESCE(p_email, '')));
  prev_last_failed timestamptz;
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

  SELECT ls.last_failed_at, ls.failed_attempts, ls.locked_at
  INTO prev_last_failed, attempts, locked
  FROM public.login_security ls
  WHERE ls.user_id = uid;

  -- Anti-spam : un échec compté au maximum toutes les 2 secondes par compte.
  IF prev_last_failed IS NOT NULL AND prev_last_failed > now() - interval '2 seconds' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'locked', locked IS NOT NULL,
      'just_locked', false,
      'attempts', COALESCE(attempts, 0)
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
$function$;

NOTIFY pgrst, 'reload schema';
