-- The anti-spam throttle in record_login_failure (added 24/08, unrelated to today's
-- work) counted at most 1 failure every 30 seconds per account. In practice this meant
-- 4 real wrong-password attempts typed a few seconds apart only counted as 1 failure,
-- so the account never reached locked_at and the real "Déblocage de compte" email never
-- fired -- the UI used to paper over this by always claiming success regardless of the
-- real server state (now fixed on the frontend to be honest about it).
-- The native Supabase "Password Verification Attempt" Auth Hook (which would make this
-- throttle unnecessary, since it can't be spoofed via anonymous RPC) requires a
-- Team/Enterprise plan not available on this project. As a pragmatic middle ground,
-- shorten the throttle window so genuine, human-paced retries are correctly counted,
-- while a scripted abuser calling the RPC directly still faces real friction (4 calls
-- minimum ~12 seconds apart) on top of the Turnstile captcha already gating the login
-- form itself.

create or replace function public.record_login_failure(p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid;
  attempts integer := 0;
  locked timestamptz;
  just_locked boolean := false;
  normalized text := lower(btrim(coalesce(p_email, '')));
  prev_last_failed timestamptz;
begin
  if normalized = '' then
    return jsonb_build_object('ok', true, 'locked', false, 'just_locked', false, 'attempts', 0);
  end if;

  select u.id into uid
  from auth.users u
  where lower(u.email) = normalized
  limit 1;

  if uid is null then
    return jsonb_build_object(
      'ok', true,
      'locked', false,
      'just_locked', false,
      'attempts', 0
    );
  end if;

  select ls.last_failed_at, ls.failed_attempts, ls.locked_at
  into prev_last_failed, attempts, locked
  from public.login_security ls
  where ls.user_id = uid;

  -- Anti-spam : un échec compté au maximum toutes les 3 secondes par compte
  -- (réduit de 30s -> assez court pour ne pas gêner une vraie séquence de
  -- 4 tentatives tapées à la main, assez long pour freiner un appel RPC scripté).
  if prev_last_failed is not null and prev_last_failed > now() - interval '3 seconds' then
    return jsonb_build_object(
      'ok', true,
      'locked', locked is not null,
      'just_locked', false,
      'attempts', coalesce(attempts, 0)
    );
  end if;

  insert into public.login_security (user_id, failed_attempts, last_failed_at, updated_at)
  values (uid, 1, now(), now())
  on conflict (user_id) do update
  set
    failed_attempts = case
      when public.login_security.locked_at is not null
        then public.login_security.failed_attempts
      else least(public.login_security.failed_attempts + 1, 20)
    end,
    last_failed_at = now(),
    updated_at = now()
  returning failed_attempts, locked_at into attempts, locked;

  if locked is null and attempts >= 4 then
    update public.login_security
    set locked_at = now(), updated_at = now()
    where user_id = uid
      and locked_at is null
    returning locked_at into locked;
    just_locked := locked is not null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'locked', locked is not null,
    'just_locked', just_locked,
    'attempts', attempts
  );
end;
$function$;
