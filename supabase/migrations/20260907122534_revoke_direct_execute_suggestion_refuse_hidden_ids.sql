-- Security fix (2026-09-07): suggestion_refuse_hidden_ids(p_viewer uuid) was directly
-- callable by any authenticated client via PostgREST RPC with an arbitrary p_viewer,
-- disabling row_security internally (needed so suggest_profiles can read across users'
-- inbox_responses) but without checking p_viewer = auth.uid(). This let any logged-in
-- user query who refused/was refused by any other user (privacy leak).
-- suggest_profiles (SECURITY DEFINER, called only with me := auth.uid()) still works:
-- a SECURITY DEFINER function calling another SECURITY DEFINER function via direct SQL
-- runs as the function owner and does not need the authenticated/anon EXECUTE grant.
REVOKE EXECUTE ON FUNCTION public.suggestion_refuse_hidden_ids(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.suggestion_refuse_hidden_ids(uuid) FROM anon;
