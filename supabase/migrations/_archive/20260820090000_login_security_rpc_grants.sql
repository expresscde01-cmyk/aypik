-- ARCHIVÉ le 2026-09-10 : jamais tracké dans schema_migrations. GRANT ... TO anon, authenticated, postgres, service_role sur login_security_status et record_login_failure — même risque de régression. Remplacé par 20260910130233_reconcile_login_security_initial_setup.sql et 20260910120544_revoke_preauth_account_oracles.sql. Ne pas rejouer tel quel.
-- Les RPC login_security_* renvoyaient 404 via PostgREST (droits / cache schéma).
-- Sans elles, le compteur SQL ne s’incrémente pas et login-security plantait.

GRANT EXECUTE ON FUNCTION public.login_security_status(text) TO anon, authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.record_login_failure(text) TO anon, authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.login_security_lock_payload(text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.mark_login_lock_email_sent(uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.login_security_user_id(text) TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
