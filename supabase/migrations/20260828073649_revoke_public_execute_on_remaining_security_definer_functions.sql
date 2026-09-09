-- Follow-up to the previous revoke migration: 13 SECURITY DEFINER functions were
-- still executable by anon afterward, not because the anon-specific REVOKE failed,
-- but because Postgres also had EXECUTE granted to the PUBLIC pseudo-role on them
-- (the Postgres default at function creation, never explicitly revoked here) --
-- and every role, including anon, implicitly inherits whatever PUBLIC has.
-- Revoking from anon alone doesn't remove that. Two of these (has_active_boost,
-- has_active_premium) return boolean and are directly callable via
-- /rest/v1/rpc/..., letting anon probe another user's premium/boost status by
-- uuid. The other eleven are trigger / event-trigger functions (return type
-- 'trigger' / 'event_trigger'): Postgres/PostgREST cannot invoke those directly
-- via RPC, so they aren't remotely exploitable, but they're revoked too for
-- defense-in-depth -- the trigger mechanism itself runs as the function owner and
-- never needed PUBLIC/anon to have EXECUTE in the first place.

revoke execute on function public.enforce_active_account_on_social() from public;
revoke execute on function public.enforce_adult_on_flash() from public;
revoke execute on function public.enforce_dating_age_on_like() from public;
revoke execute on function public.enforce_unique_account_email() from public;
revoke execute on function public.enforce_unique_identity_email() from public;
revoke execute on function public.has_active_boost(uuid) from public;
revoke execute on function public.has_active_premium(uuid) from public;
revoke execute on function public.notify_on_new_message() from public;
revoke execute on function public.on_profile_created_membership() from public;
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.touch_conversation_on_message() from public;
revoke execute on function public.touch_last_active_from_sender() from public;
revoke execute on function public.touch_last_active_from_user() from public;

-- Restore explicit access for the roles that still legitimately need these two
-- (has_active_boost/has_active_premium are called from other SECURITY DEFINER
-- functions internally, which doesn't require EXECUTE since those run as the
-- owner -- but grant back to authenticated in case the frontend also calls them
-- directly for a logged-in user's own status checks).
grant execute on function public.has_active_boost(uuid) to authenticated;
grant execute on function public.has_active_premium(uuid) to authenticated;
