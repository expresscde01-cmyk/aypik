-- Claim atomique de l’e-mail de blocage : un seul envoi (modèle B) au 4e échec.

CREATE OR REPLACE FUNCTION public.claim_login_lock_email(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_user');
  END IF;

  UPDATE public.login_security
  SET lock_email_sent_at = now(),
      updated_at = now()
  WHERE user_id = p_user
    AND locked_at IS NOT NULL
    AND lock_email_sent_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'already_sent', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'claimed', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_login_lock_email(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.login_security
  SET lock_email_sent_at = NULL,
      updated_at = now()
  WHERE user_id = p_user
    AND locked_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_login_lock_email(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_login_lock_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_login_lock_email(uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.release_login_lock_email(uuid) TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
