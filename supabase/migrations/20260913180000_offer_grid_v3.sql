-- Cahier offres v3 : palier Basique, essai Gratuit 7 jours,
-- destinataire ouvert/protégé, plancher d'âge 18 ans, quotas.

-- 1. Plans
alter table public.memberships
  drop constraint if exists memberships_plan_check;

alter table public.memberships
  add constraint memberships_plan_check
  check (plan = any (array[
    'free'::text,
    'founder'::text,
    'basique'::text,
    'essentiel'::text,
    'confort'::text,
    'premium'::text
  ]));

alter table public.payment_subscriptions
  drop constraint if exists payment_subscriptions_plan_check;

alter table public.payment_subscriptions
  add constraint payment_subscriptions_plan_check
  check (
    plan is null
    or plan = any (array[
      'basique'::text,
      'essentiel'::text,
      'confort'::text,
      'premium'::text
    ])
  );

insert into public.platform_settings (key, value)
values ('basique_price_cents', to_jsonb(999))
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 2. Plancher légal 18 ans au-dessus de floor(âge/2)+7
create or replace function public.dating_partner_old_enough(
  p_viewer_birth date,
  p_partner_birth date
)
returns boolean
language sql
stable
parallel safe
set search_path to public
as $$
  select
    p_viewer_birth is not null
    and p_partner_birth is not null
    and public.is_adult(p_partner_birth)
    and public.profile_age(p_partner_birth)
        >= greatest(18, public.min_partner_age(public.profile_age(p_viewer_birth)));
$$;

-- 3. Messagerie payante : Basique → Premium (abonnement en cours)
create or replace function public.has_paid_messaging(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  m public.memberships%rowtype;
begin
  select * into m from public.memberships where user_id = p_user_id;
  if not found then
    return false;
  end if;
  if m.plan in ('basique', 'essentiel', 'confort', 'premium')
     and (m.premium_until is null or m.premium_until > now()) then
    return true;
  end if;
  return public.has_active_premium(p_user_id);
end;
$$;

revoke all on function public.has_paid_messaging(uuid) from public;
grant execute on function public.has_paid_messaging(uuid) to authenticated;

-- Destinataire joignable sans Match (Gratuit / Basique / Essentiel, hors fenêtre Fondateur)
create or replace function public.is_open_messaging_profile(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  m public.memberships%rowtype;
begin
  select * into m from public.memberships where user_id = p_user_id;
  if not found then
    return true;
  end if;
  if coalesce(m.is_founder, false)
     and m.founder_premium_until is not null
     and m.founder_premium_until > now() then
    return false;
  end if;
  return coalesce(m.plan, 'free') in ('free', 'basique', 'essentiel');
end;
$$;

revoke all on function public.is_open_messaging_profile(uuid) from public;
grant execute on function public.is_open_messaging_profile(uuid) to authenticated;

-- 4. Essai Gratuit : 7 jours, une fois. Fondateur : 6 mois.
create or replace function public._account_access_phase(p_user_id uuid)
returns jsonb
language plpgsql
stable
set search_path to public
as $function$
declare
  m public.memberships%rowtype;
  v_full_until timestamptz;
  v_simplified_until timestamptz;
  v_phase text;
begin
  select * into m from public.memberships where user_id = p_user_id;
  if not found then
    return jsonb_build_object(
      'phase', 'trial_full',
      'full_access_until', null,
      'simplified_free_until', null,
      'payment_visible', false,
      'has_messaging_access', true
    );
  end if;

  if coalesce(m.is_founder, false) then
    v_full_until := coalesce(m.founder_premium_until, m.created_at + interval '6 months');
    v_simplified_until := v_full_until;
  else
    v_full_until := m.created_at + interval '7 days';
    v_simplified_until := v_full_until;
  end if;

  if now() < v_full_until then
    v_phase := case when coalesce(m.is_founder, false) then 'founder_full' else 'trial_full' end;
  elsif now() < v_simplified_until then
    v_phase := 'trial_simplified';
  else
    v_phase := 'post_trial';
  end if;

  return jsonb_build_object(
    'phase', v_phase,
    'full_access_until', v_full_until,
    'simplified_free_until', v_simplified_until,
    'payment_visible', now() >= v_simplified_until,
    'has_messaging_access',
      (v_phase is distinct from 'post_trial')
      or public.has_paid_messaging(p_user_id)
  );
end;
$function$;

-- 5. insert_chat_message : capacité d'envoi + destinataire ouvert/protégé
create or replace function public.insert_chat_message(p_recipient uuid, p_content text)
returns public.messages
language plpgsql
security definer
set search_path to public
as $$
declare
  me uuid := auth.uid();
  cleaned text := btrim(coalesce(p_content, ''));
  a uuid;
  b uuid;
  conv_id uuid;
  row_out public.messages;
  my_phase jsonb;
begin
  perform set_config('row_security', 'off', true);
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if p_recipient is null or p_recipient = me then
    raise exception 'invalid_participant';
  end if;
  if cleaned = '' then
    raise exception 'empty_message';
  end if;
  if public.profile_is_deactivated(p_recipient)
    or public.profile_is_deactivated(me) then
    raise exception 'member_unavailable';
  end if;

  my_phase := public._account_access_phase(me);
  if (my_phase ->> 'phase') = 'post_trial'
     and not public.has_paid_messaging(me) then
    raise exception 'payment_required';
  end if;

  if not public.users_are_matched(me, p_recipient)
     and not public.is_open_messaging_profile(p_recipient) then
    raise exception 'not_matched';
  end if;

  a := least(me, p_recipient);
  b := greatest(me, p_recipient);

  select id into conv_id
  from public.conversations
  where user_a = a and user_b = b;

  if conv_id is null then
    insert into public.conversations (user_a, user_b)
    values (a, b)
    on conflict (user_a, user_b) do nothing;

    select id into conv_id
    from public.conversations
    where user_a = a and user_b = b;
  end if;

  insert into public.messages (conversation_id, sender_id, recipient_id, content)
  values (conv_id, me, p_recipient, cleaned)
  returning * into row_out;

  return row_out;
end;
$$;

-- 6. activate_paid_premium accepte basique / essentiel
create or replace function public.activate_paid_premium(
  p_user_id uuid,
  p_provider text,
  p_period_end timestamptz default null,
  p_plan text default 'confort'
)
returns void
language plpgsql
security definer
set search_path to public
as $$
declare
  v_plan text := case
    when p_plan in ('basique', 'essentiel', 'confort', 'premium') then p_plan
    else 'confort'
  end;
  v_offer_label text := initcap(v_plan);
begin
  perform set_config('aypik.allow_paid_meta', '1', true);

  insert into public.memberships (
    user_id,
    plan,
    premium_until,
    payment_provider,
    paid_premium_started_at
  )
  values (
    p_user_id,
    v_plan,
    coalesce(p_period_end, now() + interval '1 month'),
    p_provider,
    now()
  )
  on conflict (user_id) do update set
    plan = v_plan,
    premium_until = coalesce(p_period_end, now() + interval '1 month'),
    payment_provider = p_provider,
    paid_premium_started_at = coalesce(
      public.memberships.paid_premium_started_at,
      now()
    ),
    updated_at = now();

  insert into public.membership_notifications (user_id, kind, title, body)
  values (
    p_user_id,
    'premium_activated',
    v_offer_label || ' actif',
    'Merci pour ton soutien. Ton abonnement ' || v_offer_label || ' est actif. Tu peux le résilier à tout moment en un clic depuis ton profil.'
  );
end;
$$;

-- 7. Options à la carte (Visibilité / Francophone / International)
alter table public.memberships
  add column if not exists visibilite_until timestamptz,
  add column if not exists francophone_until timestamptz,
  add column if not exists international_until timestamptz;

insert into public.platform_settings (key, value)
values
  ('essentiel_price_cents', to_jsonb(1499)),
  ('visibilite_price_cents', to_jsonb(299)),
  ('francophone_price_cents', to_jsonb(299)),
  ('international_price_cents', to_jsonb(599)),
  ('free_daily_likes', to_jsonb(5)),
  ('free_daily_flashes', to_jsonb(2))
on conflict (key) do update set value = excluded.value, updated_at = now();

alter table public.payment_subscriptions
  drop constraint if exists payment_subscriptions_plan_check;

alter table public.payment_subscriptions
  add constraint payment_subscriptions_plan_check
  check (
    plan is null
    or plan = any (array[
      'basique'::text,
      'essentiel'::text,
      'confort'::text,
      'premium'::text,
      'visibilite'::text,
      'francophone'::text,
      'international'::text
    ])
  );

create or replace function public.offer_founder_window(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  m public.memberships%rowtype;
begin
  select * into m from public.memberships where user_id = p_user_id;
  if not found then
    return false;
  end if;
  return coalesce(m.is_founder, false)
    and m.founder_premium_until is not null
    and m.founder_premium_until > now();
end;
$$;

create or replace function public.offer_unlimited_likes_flashes(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public
as $$
  select public.has_active_premium(p_user_id);
$$;

create or replace function public.offer_daily_like_limit(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  m public.memberships%rowtype;
begin
  if public.offer_unlimited_likes_flashes(p_user_id) then
    return null;
  end if;
  select * into m from public.memberships where user_id = p_user_id;
  if found
     and m.plan = 'essentiel'
     and (m.premium_until is null or m.premium_until > now()) then
    return 10;
  end if;
  if found
     and m.plan = 'basique'
     and (m.premium_until is null or m.premium_until > now()) then
    return 7;
  end if;
  return 5;
end;
$$;

create or replace function public.offer_daily_flash_limit(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  m public.memberships%rowtype;
begin
  if public.offer_unlimited_likes_flashes(p_user_id) then
    return null;
  end if;
  select * into m from public.memberships where user_id = p_user_id;
  if found
     and m.plan = 'essentiel'
     and (m.premium_until is null or m.premium_until > now()) then
    return 3;
  end if;
  return 2;
end;
$$;

create or replace function public.offer_can_personalize_search(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  m public.memberships%rowtype;
begin
  if public.offer_founder_window(p_user_id) then
    return true;
  end if;
  select * into m from public.memberships where user_id = p_user_id;
  if not found then
    return false;
  end if;
  return m.plan in ('essentiel', 'confort', 'premium')
    and (m.premium_until is null or m.premium_until > now());
end;
$$;

create or replace function public.offer_has_francophone_access(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  m public.memberships%rowtype;
begin
  if public.offer_founder_window(p_user_id) then
    return true;
  end if;
  select * into m from public.memberships where user_id = p_user_id;
  if not found then
    return false;
  end if;
  if m.plan in ('confort', 'premium')
     and (m.premium_until is null or m.premium_until > now()) then
    return true;
  end if;
  if m.international_until is not null and m.international_until > now() then
    return true;
  end if;
  return m.francophone_until is not null and m.francophone_until > now();
end;
$$;

create or replace function public.offer_has_international_access(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  m public.memberships%rowtype;
begin
  if public.offer_founder_window(p_user_id) then
    return true;
  end if;
  select * into m from public.memberships where user_id = p_user_id;
  if not found then
    return false;
  end if;
  if m.plan = 'premium'
     and (m.premium_until is null or m.premium_until > now()) then
    return true;
  end if;
  return m.international_until is not null and m.international_until > now();
end;
$$;

create or replace function public.offer_has_visibility_access(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  m public.memberships%rowtype;
begin
  if public.offer_founder_window(p_user_id) then
    return true;
  end if;
  select * into m from public.memberships where user_id = p_user_id;
  if not found then
    return false;
  end if;
  if m.plan = 'premium'
     and (m.premium_until is null or m.premium_until > now()) then
    return true;
  end if;
  return m.visibilite_until is not null and m.visibilite_until > now();
end;
$$;

create or replace function public.offer_can_buy_addons(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  m public.memberships%rowtype;
begin
  if public.offer_founder_window(p_user_id) then
    return true;
  end if;
  select * into m from public.memberships where user_id = p_user_id;
  if not found then
    return false;
  end if;
  return m.plan in ('essentiel', 'confort', 'premium')
    and (m.premium_until is null or m.premium_until > now());
end;
$$;

-- Verrou recherche : Gratuit / Basique figés ; Corse / outre-mer → national.
create or replace function public.offer_clamp_discover_args(
  p_user_id uuid,
  p_geo_perimeter text,
  p_min_overlap integer
)
returns table(geo_perimeter text, min_overlap integer)
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  m public.memberships%rowtype;
  v_perimeter text := lower(trim(coalesce(p_geo_perimeter, '')));
  v_overlap integer := greatest(coalesce(p_min_overlap, 0), 0);
  v_exclusive boolean := false;
  v_region text;
  v_has_neighbors boolean := true;
begin
  if v_perimeter ~ '__x$' then
    v_exclusive := true;
    v_perimeter := regexp_replace(v_perimeter, '__x$', '');
  end if;

  select * into m from public.memberships where user_id = p_user_id;

  if public.offer_can_personalize_search(p_user_id) then
    if v_perimeter = 'international'
       and not public.offer_has_international_access(p_user_id) then
      v_perimeter := case
        when public.offer_has_francophone_access(p_user_id)
          then 'la_france_dans_le_monde'
        else 'anywhere'
      end;
      v_exclusive := false;
    elsif v_perimeter in ('la_france_dans_le_monde', 'france_dans_le_monde')
       and not public.offer_has_francophone_access(p_user_id)
       and not public.offer_has_international_access(p_user_id) then
      v_perimeter := 'anywhere';
      v_exclusive := false;
    end if;
    geo_perimeter := case when v_exclusive then v_perimeter || '__x' else v_perimeter end;
    min_overlap := v_overlap;
    return next;
    return;
  end if;

  v_overlap := 0;
  v_exclusive := false;
  if found and m.plan = 'basique'
     and (m.premium_until is null or m.premium_until > now()) then
    v_perimeter := 'anywhere';
  else
    select public.dept_to_region(public.location_dept_code(p.location))
      into v_region
    from public.profiles p
    where p.id = p_user_id;
    select exists (
      select 1 from public.region_neighbors n where n.region = v_region
    ) into v_has_neighbors;
    if v_region is null or not v_has_neighbors then
      v_perimeter := 'anywhere';
    else
      v_perimeter := 'neighboring_region';
    end if;
  end if;

  geo_perimeter := v_perimeter;
  min_overlap := v_overlap;
  return next;
end;
$$;

create or replace function public.activate_paid_addon(
  p_user_id uuid,
  p_offer text,
  p_period_end timestamptz default null
)
returns void
language plpgsql
security definer
set search_path to public
as $$
declare
  v_until timestamptz := coalesce(p_period_end, now() + interval '1 month');
begin
  if p_offer not in ('visibilite', 'francophone', 'international') then
    raise exception 'invalid_addon';
  end if;
  if not public.offer_can_buy_addons(p_user_id) then
    raise exception 'addon_requires_essentiel';
  end if;

  perform set_config('aypik.allow_paid_meta', '1', true);

  if p_offer = 'international' then
    update public.memberships
    set international_until = v_until,
        francophone_until = null,
        updated_at = now()
    where user_id = p_user_id;
  elsif p_offer = 'francophone' then
    update public.memberships
    set francophone_until = case
          when international_until is not null and international_until > now()
            then francophone_until
          else v_until
        end,
        updated_at = now()
    where user_id = p_user_id;
  else
    update public.memberships
    set visibilite_until = v_until,
        updated_at = now()
    where user_id = p_user_id;
  end if;
end;
$$;

-- 8. Quota likes côté serveur
create or replace function public.enforce_daily_like_quota()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_limit integer;
  v_used integer;
begin
  v_limit := public.offer_daily_like_limit(NEW.from_user);
  if v_limit is null then
    return NEW;
  end if;
  select count(*)::integer into v_used
  from public.likes
  where from_user = NEW.from_user
    and created_at >= date_trunc('day', now());
  if v_used >= v_limit then
    raise exception 'like_quota_exhausted';
  end if;
  return NEW;
end;
$$;

drop trigger if exists likes_enforce_daily_quota on public.likes;
create trigger likes_enforce_daily_quota
before insert on public.likes
for each row
execute function public.enforce_daily_like_quota();

-- 9. Statut membership : quotas et droits par palier
create or replace function public.get_my_membership_status()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  uid uuid := auth.uid();
  m public.memberships%rowtype;
  founders_count integer;
  max_slots integer;
  like_limit integer;
  likes_today integer;
  boost_ends timestamptz;
  premium boolean;
  founder_entitled boolean;
  boosted boolean;
  price_cents integer;
  confort_cents integer;
  essentiel_cents integer;
  basique_cents integer;
  vis_cents integer;
  franco_cents integer;
  intl_cents integer;
  currency text;
  interval_label text;
  founder_trial_cents integer;
  founder_months integer;
  on_founder_trial boolean;
  effective_price_cents integer;
  can_filter boolean;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into m from public.memberships where user_id = uid;
  price_cents := get_setting_int('premium_price_cents', 2499);
  confort_cents := get_setting_int('confort_price_cents', 1999);
  essentiel_cents := get_setting_int('essentiel_price_cents', 1499);
  basique_cents := get_setting_int('basique_price_cents', 999);
  vis_cents := get_setting_int('visibilite_price_cents', 299);
  franco_cents := get_setting_int('francophone_price_cents', 299);
  intl_cents := get_setting_int('international_price_cents', 599);
  currency := get_setting_text('premium_currency', 'EUR');
  interval_label := get_setting_text('premium_interval', 'month');
  founder_trial_cents := get_setting_int('founder_trial_price_cents', 0);
  founder_months := get_setting_int('founder_premium_months', 6);
  founders_count := count_founders();
  max_slots := get_setting_int('founder_max_slots', 500);

  if not found then
    like_limit := 5;
    return jsonb_build_object(
      'membership_linked', false,
      'plan', 'free',
      'is_founder', false,
      'has_premium', false,
      'has_boost', false,
      'founders_remaining', greatest(max_slots - founders_count, 0),
      'founders_taken', founders_count,
      'founders_max', max_slots,
      'premium_price_cents', price_cents,
      'confort_price_cents', confort_cents,
      'essentiel_price_cents', essentiel_cents,
      'basique_price_cents', basique_cents,
      'visibilite_price_cents', vis_cents,
      'francophone_price_cents', franco_cents,
      'international_price_cents', intl_cents,
      'premium_currency', currency,
      'premium_interval', interval_label,
      'founder_trial_price_cents', founder_trial_cents,
      'founder_premium_months', founder_months,
      'on_founder_trial', false,
      'effective_price_cents', price_cents,
      'unlimited_likes', false,
      'free_daily_likes', like_limit,
      'likes_used_today', 0,
      'likes_remaining_today', like_limit,
      'can_see_who_liked', false,
      'can_use_advanced_filters', false,
      'has_visibility_access', false,
      'has_francophone_access', false,
      'has_international_access', false,
      'visibilite_until', null,
      'francophone_until', null,
      'international_until', null
    ) || public._account_access_phase(uid);
  end if;

  if m.is_founder
     and m.plan = 'founder'
     and m.founder_premium_until is not null
     and m.founder_premium_until <= now() then
    update public.memberships
    set plan = 'free', updated_at = now()
    where user_id = uid;
    m.plan := 'free';
  end if;

  founder_entitled := public.offer_founder_window(uid);
  premium := public.has_active_premium(uid);
  boosted := public.has_active_boost(uid);
  on_founder_trial := founder_entitled;
  like_limit := public.offer_daily_like_limit(uid);
  can_filter := public.offer_can_personalize_search(uid);
  effective_price_cents := case
    when on_founder_trial then founder_trial_cents
    else price_cents
  end;

  select count(*)::integer into likes_today
  from public.likes
  where from_user = uid
    and created_at >= date_trunc('day', now());

  select max(ends_at) into boost_ends
  from public.profile_boosts
  where user_id = uid
    and payment_status in ('paid', 'simulated')
    and ends_at > now();

  return jsonb_build_object(
    'membership_linked', true,
    'user_id', uid,
    'plan', m.plan,
    'is_founder', m.is_founder,
    'founder_number', m.founder_number,
    'founder_premium_until', m.founder_premium_until,
    'premium_until', m.premium_until,
    'has_premium', premium,
    'has_boost', boosted,
    'boost_ends_at', boost_ends,
    'founders_taken', founders_count,
    'founders_max', max_slots,
    'founders_remaining', greatest(max_slots - founders_count, 0),
    'free_daily_likes', coalesce(like_limit, 0),
    'likes_used_today', likes_today,
    'likes_remaining_today', case
      when like_limit is null then null
      else greatest(like_limit - likes_today, 0)
    end,
    'can_see_who_liked', premium,
    'can_use_advanced_filters', can_filter,
    'unlimited_likes', premium,
    'premium_price_cents', price_cents,
    'confort_price_cents', confort_cents,
    'essentiel_price_cents', essentiel_cents,
    'basique_price_cents', basique_cents,
    'visibilite_price_cents', vis_cents,
    'francophone_price_cents', franco_cents,
    'international_price_cents', intl_cents,
    'premium_currency', currency,
    'premium_interval', interval_label,
    'founder_trial_price_cents', founder_trial_cents,
    'founder_premium_months', founder_months,
    'on_founder_trial', on_founder_trial,
    'effective_price_cents', effective_price_cents,
    'has_visibility_access', public.offer_has_visibility_access(uid),
    'has_francophone_access', public.offer_has_francophone_access(uid),
    'has_international_access', public.offer_has_international_access(uid),
    'visibilite_until', m.visibilite_until,
    'francophone_until', m.francophone_until,
    'international_until', m.international_until
  ) || public._account_access_phase(uid);
end;
$$;

revoke all on function public.activate_paid_addon(uuid, text, timestamptz) from public;
grant execute on function public.activate_paid_addon(uuid, text, timestamptz) to service_role;

notify pgrst, 'reload schema';
