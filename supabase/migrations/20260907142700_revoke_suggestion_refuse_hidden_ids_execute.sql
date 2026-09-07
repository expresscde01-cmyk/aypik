-- Alignement prod : suggestion_refuse_hidden_ids n’est pas appelable via PostgREST.
-- (REVOKE EXECUTE authenticated + anon déjà appliqués en base.)

REVOKE EXECUTE ON FUNCTION public.suggestion_refuse_hidden_ids(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.suggestion_refuse_hidden_ids(uuid) FROM anon;
