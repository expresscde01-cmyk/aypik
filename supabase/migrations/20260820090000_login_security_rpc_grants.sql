-- Les RPC login_security_* renvoyaient 404 via PostgREST (droits / cache schéma).
-- Sans elles, le compteur SQL ne s’incrémente pas et login-security plantait.

GRANT EXECUTE ON FUNCTION public.login_security_status(text) TO anon, authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.record_login_failure(text) TO anon, authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.login_security_lock_payload(text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.mark_login_lock_email_sent(uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.login_security_user_id(text) TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
