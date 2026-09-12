-- Étape 1 du chantier paiement : réactivation de l'offre payante actuelle
-- (renommée "Confort", 19,99 €) + introduction du nouveau palier "Premium"
-- (24,99 €, = Confort + Visibilité + Pays francophone + International, mais
-- ces 3 réglages restent gratuits pour tous tant que l'étape 2 ne les
-- verrouille pas — cf. décision "option B" avec l'utilisateur). Essentiel
-- (14,99 €) est ajouté à la contrainte plan pour ne pas y retoucher plus
-- tard, mais n'est pas encore vendable (aucun code ne le pose).

-- 1. memberships.plan : free/founder/premium -> free/founder/essentiel/confort/premium
alter table public.memberships
  drop constraint memberships_plan_check;

alter table public.memberships
  add constraint memberships_plan_check
  check (plan = any (array['free'::text, 'founder'::text, 'essentiel'::text, 'confort'::text, 'premium'::text]));

-- 2. payment_subscriptions.plan : quel palier cet abonnement paie-t-il ?
--    (jusqu'ici rien ne le distinguait, un seul prix était possible)
alter table public.payment_subscriptions
  add column if not exists plan text;

alter table public.payment_subscriptions
  add constraint payment_subscriptions_plan_check
  check (plan is null or plan = any (array['confort'::text, 'premium'::text]));

-- 3. Tarifs de référence : Confort reprend l'ancien prix unique (19,99 €),
--    Premium devient le nouveau palier (24,99 €).
insert into public.platform_settings (key, value)
values ('confort_price_cents', to_jsonb(1999))
on conflict (key) do update set value = excluded.value, updated_at = now();

update public.platform_settings
set value = to_jsonb(2499), updated_at = now()
where key = 'premium_price_cents';

-- 4. has_active_premium : Confort ET Premium ouvrent les mêmes 3 droits
--    qu'aujourd'hui (likes illimités, qui m'a liké, filtres avancés) —
--    aucune différenciation fonctionnelle Confort/Premium tant que
--    Visibilité/Pays francophone/International ne sont pas verrouillés
--    (étape 2).
create or replace function public.has_active_premium(p_user_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  m memberships%rowtype;
begin
  select * into m from memberships where user_id = p_user_id;
  if not found then
    return false;
  end if;

  if m.plan in ('confort', 'premium')
     and (m.premium_until is null or m.premium_until > now()) then
    return true;
  end if;

  -- Privilèges fondateur uniquement pendant la fenêtre de 6 mois.
  if coalesce(m.is_founder, false)
     and m.founder_premium_until is not null
     and m.founder_premium_until > now() then
    return true;
  end if;

  return false;
end;
$$;

-- 5. activate_paid_premium : accepte désormais le palier acheté (confort |
--    premium par défaut confort pour compat arrière), au lieu de forcer
--    'premium' pour tout le monde.
create or replace function public.activate_paid_premium(
  p_user_id uuid,
  p_provider text,
  p_period_end timestamptz default null,
  p_plan text default 'confort'
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plan text := case when p_plan in ('confort', 'premium') then p_plan else 'confort' end;
  v_offer_label text := case when v_plan = 'premium' then 'Premium' else 'Confort' end;
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

-- 6. process_membership_expiry_reminders : wording mis à jour (Confort /
--    Premium au lieu de "simplifié ou détaillé"), et le rappel de
--    renouvellement couvre désormais les deux paliers payants.
create or replace function public.process_membership_expiry_reminders()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_notif_id uuid;
  trial_notified integer := 0;
  premium_notified integer := 0;
begin
  perform set_config('row_security', 'off', true);

  -- A. Fin de la période gratuite de lancement (Fondateur ou non), 7 jours
  --    avant. simplified_free_until vaut founder_premium_until pour un
  --    Fondateur (pas de palier intermédiaire), et created_at + 6 mois pour
  --    un non-Fondateur — dans les deux cas, c'est l'échéance à laquelle le
  --    compte doit choisir une offre.
  for r in
    select m.user_id, m.is_founder, phase.value as phase_info
    from public.memberships m,
    lateral (select public._account_access_phase(m.user_id) as value) as phase
    where m.trial_expiry_notified_at is null
      and (phase.value ->> 'simplified_free_until') is not null
      and (phase.value ->> 'simplified_free_until')::timestamptz
        between now() and now() + interval '7 days'
  loop
    insert into public.social_notifications (user_id, kind, title, body)
    values (
      r.user_id,
      'membership_expiring',
      'Ta période gratuite se termine bientôt',
      case when r.is_founder then
        'Tes avantages Membre Fondateur se terminent dans 7 jours. Ton badge honorifique reste acquis à vie ; pense à choisir ton offre (Confort ou Premium) pour continuer à échanger sans interruption.'
      else
        'Ton accès gratuit se termine dans 7 jours. Pense à choisir ton offre (Confort ou Premium) pour continuer à échanger sans interruption.'
      end
    )
    returning id into v_notif_id;

    if v_notif_id is not null then
      perform public.request_social_email(v_notif_id);
      trial_notified := trial_notified + 1;
    end if;

    update public.memberships set trial_expiry_notified_at = now() where user_id = r.user_id;
  end loop;

  -- B. Renouvellement d'un abonnement payant en cours (Confort 19,99 € ou
  --    Premium 24,99 €), 7 jours avant échéance. Se redéclenche à chaque
  --    cycle : la relance est comparée au premium_until courant
  --    (premium_expiry_notified_for), pas seulement envoyée une fois pour
  --    toutes.
  for r in
    select user_id, premium_until
    from public.memberships
    where plan in ('confort', 'premium')
      and premium_until is not null
      and premium_until between now() and now() + interval '7 days'
      and premium_expiry_notified_for is distinct from premium_until
  loop
    insert into public.social_notifications (user_id, kind, title, body)
    values (
      r.user_id,
      'membership_expiring',
      'Ton abonnement se renouvelle bientôt',
      'Ton abonnement payant arrive à échéance dans 7 jours. Il se renouvelle automatiquement, sauf résiliation depuis ton profil.'
    )
    returning id into v_notif_id;

    if v_notif_id is not null then
      perform public.request_social_email(v_notif_id);
      premium_notified := premium_notified + 1;
    end if;

    update public.memberships set premium_expiry_notified_for = r.premium_until where user_id = r.user_id;
  end loop;

  return jsonb_build_object('ok', true, 'trial_notified', trial_notified, 'premium_notified', premium_notified);
end;
$$;

-- 7. get_my_membership_status : expose confort_price_cents à côté de
--    premium_price_cents (désormais 24,99 €), pour que l'écran de paiement
--    puisse afficher les deux offres avec leur vrai tarif.
create or replace function public.get_my_membership_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  m memberships%rowtype;
  founders_count integer;
  max_slots integer;
  free_likes integer;
  likes_today integer;
  boost_ends timestamptz;
  premium boolean;
  founder_entitled boolean;
  boosted boolean;
  price_cents integer;
  confort_price_cents integer;
  currency text;
  interval_label text;
  founder_trial_cents integer;
  founder_months integer;
  on_founder_trial boolean;
  effective_price_cents integer;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into m from memberships where user_id = uid;
  if not found then
    price_cents := get_setting_int('premium_price_cents', 2499);
    confort_price_cents := get_setting_int('confort_price_cents', 1999);
    return jsonb_build_object(
      'membership_linked', false,
      'plan', 'free',
      'is_founder', false,
      'has_premium', false,
      'has_boost', false,
      'founders_remaining', greatest(
        get_setting_int('founder_max_slots', 500) - count_founders(),
        0
      ),
      'founders_taken', count_founders(),
      'founders_max', get_setting_int('founder_max_slots', 500),
      'premium_price_cents', price_cents,
      'confort_price_cents', confort_price_cents,
      'premium_currency', get_setting_text('premium_currency', 'EUR'),
      'premium_interval', get_setting_text('premium_interval', 'month'),
      'founder_trial_price_cents', get_setting_int('founder_trial_price_cents', 0),
      'founder_premium_months', get_setting_int('founder_premium_months', 6),
      'on_founder_trial', false,
      'effective_price_cents', price_cents,
      'unlimited_likes', false,
      'likes_remaining_today', get_setting_int('free_daily_likes', 10),
      'can_see_who_liked', false,
      'can_use_advanced_filters', false
    ) || public._account_access_phase(uid);
  end if;

  -- Fenêtre écoulée : plan free, titre conservé (trigger + pas de SET is_founder).
  if m.is_founder
     and m.plan = 'founder'
     and m.founder_premium_until is not null
     and m.founder_premium_until <= now() then
    update memberships
    set plan = 'free', updated_at = now()
    where user_id = uid;
    m.plan := 'free';
  end if;

  founder_entitled :=
    coalesce(m.is_founder, false)
    and m.founder_premium_until is not null
    and m.founder_premium_until > now();

  premium := has_active_premium(uid);
  boosted := has_active_boost(uid);
  founders_count := count_founders();
  max_slots := get_setting_int('founder_max_slots', 500);
  free_likes := get_setting_int('free_daily_likes', 10);
  price_cents := get_setting_int('premium_price_cents', 2499);
  confort_price_cents := get_setting_int('confort_price_cents', 1999);
  currency := get_setting_text('premium_currency', 'EUR');
  interval_label := get_setting_text('premium_interval', 'month');
  founder_trial_cents := get_setting_int('founder_trial_price_cents', 0);
  founder_months := get_setting_int('founder_premium_months', 6);

  on_founder_trial := founder_entitled;

  effective_price_cents := case
    when on_founder_trial then founder_trial_cents
    else price_cents
  end;

  select count(*)::integer into likes_today
  from likes
  where from_user = uid
    and created_at >= date_trunc('day', now());

  select max(ends_at) into boost_ends
  from profile_boosts
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
    'free_daily_likes', free_likes,
    'likes_used_today', likes_today,
    'likes_remaining_today', case
      when premium then null
      else greatest(free_likes - likes_today, 0)
    end,
    'can_see_who_liked', premium,
    'can_use_advanced_filters', premium,
    'unlimited_likes', premium,
    'premium_price_cents', price_cents,
    'confort_price_cents', confort_price_cents,
    'premium_currency', currency,
    'premium_interval', interval_label,
    'founder_trial_price_cents', founder_trial_cents,
    'founder_premium_months', founder_months,
    'on_founder_trial', on_founder_trial,
    'effective_price_cents', effective_price_cents
  ) || public._account_access_phase(uid);
end;
$$;
