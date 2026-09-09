-- SECURITY FIX: a full audit (security advisors + direct pg_proc grant check) found
-- 66 SECURITY DEFINER functions in public still granting EXECUTE to anon, beyond the
-- 4 already fixed in the previous migration. Most are protected internally by
-- auth.uid() checks (same low-risk class as send_flash/send_like), but several had
-- no internal check at all and are directly exploitable by unauthenticated callers:
--   - record_login_failure / login_security_lock_payload: allowed anyone to lock any
--     account by email and harvest that account's real email + display name.
--   - list_testimonial_invite_candidates: leaked premium users' emails + names with
--     no auth and no cap on p_limit.
--   - discovery_activity_ranks, has_active_boost/premium/paid_premium,
--     is_founder_window_active: let anyone probe another user's activity/premium
--     status by uuid.
-- This migration dynamically revokes anon EXECUTE from every SECURITY DEFINER
-- function in public that currently has it, except a short explicit allow-list of
-- functions that are intentionally public (signup/landing-page checks) or that must
-- stay reachable pre-authentication for the login-lockout flow itself.
-- authenticated grants are left untouched -- this only closes the unauthenticated
-- attack surface.

do $$
declare
  r record;
  keep text[] := array[
    'email_is_registered',        -- intentional: "email already registered" signup check
    'list_published_testimonials',-- intentional: public landing page content
    'platform_signup_count',      -- intentional: public landing page stat
    'record_login_failure',       -- must work pre-auth: records a failed login attempt
    'login_security_status'       -- must work pre-auth: lets the login form show lock state
  ];
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosecdef = true
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.proname <> all(keep)
  loop
    execute format('revoke execute on function %s from anon', r.oid::regprocedure);
  end loop;
end $$;

-- Also try to close the default-privileges gap: the project's built-in
-- "supabase_admin" default ACL for the public schema still grants anon EXECUTE on
-- any function newly created by that role (the earlier migration only changed the
-- default for role "postgres"). This is best-effort: it only succeeds if the
-- migration role has been granted membership in supabase_admin.
do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from anon';
exception when insufficient_privilege then
  raise notice 'skipped: insufficient privilege to alter default privileges for role supabase_admin (needs manual fix by a Supabase admin / support)';
end $$;
