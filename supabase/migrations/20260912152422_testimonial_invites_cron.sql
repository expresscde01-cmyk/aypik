-- Secret dédié pour authentifier l'appel cron -> send-testimonial-invites
-- (distinct de hook_secret, utilisé pour send-social-email).
alter table public.email_dispatch_settings
  add column if not exists cron_secret text;

update public.email_dispatch_settings
set cron_secret = '8a256dbf980630c90402d37808ba83d45cd9542564d94a11',
    updated_at = now()
where id = true;

create or replace function public.request_testimonial_invites()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.email_dispatch_settings%rowtype;
  req_id bigint;
  endpoint text;
begin
  select * into settings
  from public.email_dispatch_settings
  where id = true;

  if not found
     or nullif(trim(settings.functions_base_url), '') is null
     or nullif(trim(settings.cron_secret), '') is null then
    raise warning 'email_dispatch_settings.cron_secret manquant — relance témoignages non envoyée';
    return null;
  end if;

  endpoint := regexp_replace(trim(settings.functions_base_url), '/$', '')
    || '/send-testimonial-invites';

  select net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', settings.cron_secret
    ),
    body := '{}'::jsonb
  ) into req_id;

  return req_id;
exception
  when others then
    raise warning 'request_testimonial_invites failed: %', sqlerrm;
    return null;
end;
$$;

select cron.schedule(
  'send-testimonial-invites',
  '0 8 * * *',
  $$ select public.request_testimonial_invites(); $$
);
