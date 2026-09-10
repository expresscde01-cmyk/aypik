-- Durcit l'anti-spam de record_login_failure : un échec n'est compté au
-- maximum qu'une fois toutes les 30 secondes par compte (au lieu de 2s).
-- Objectif : rendre impraticable un verrouillage instantané d'un compte via
-- des appels bruts répétés à cette RPC (accessible avec la clé publique
-- anon), sans toucher au parcours de connexion normal. Effet secondaire
-- positif : un utilisateur légitime qui retape vite un mauvais mot de passe
-- plusieurs fois de suite n'accumule plus les échecs aussi vite non plus.
create or replace function public.record_login_failure(p_email text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $function$
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

  -- Anti-spam : un échec compté au maximum toutes les 30 secondes par compte.
  IF prev_last_failed IS NOT NULL AND prev_last_failed > now() - interval '30 seconds' THEN
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