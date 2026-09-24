-- 12. get_my_membership_status : expose Essentiel + les 3 options à la carte.
create or replace function public.get_my_membership_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  essentiel_price_cents integer;
  visibilite_price_cents integer;
  francophone_price_cents integer;
  international_price_cents integer;
  currency text;
  interval_label text;
  founder_trial_cents integer;
  founder_months integer;
  on_founder_trial boolean;
  effective_price_cents integer;
  msg_access boolean;
  vis_access boolean;
  fr_access boolean;
  intl_access boolean;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into m from memberships where user_id = uid;
  if not found then
    price_cents := get_setting_int('premium_price_cents', 2499);
    confort_price_cents := get_setting_int('confort_price_cents', 1999);
    essentiel_price_cents := get_setting_int('essentiel_price_cents', 1499);
    visibilite_price_cents := get_setting_int('visibilite_price_cents', 299);
    francophone_price_cents := get_setting_int('francophone_price_cents', 299);
    international_price_cents := get_setting_int('international_price_cents', 599);
    msg_access := public.has_messaging_access(uid);
    vis_access := public.has_addon_access(uid, 'visibilite');
    fr_access := public.has_addon_access(uid, 'francophone');
    intl_access := public.has_addon_access(uid, 'international');
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
      'essentiel_price_cents', essentiel_price_cents,
      'visibilite_price_cents', visibilite_price_cents,
      'francophone_price_cents', francophone_price_cents,
      'international_price_cents', international_price_cents,
      'premium_currency', get_setting_text('premium_currency', 'EUR'),
      'premium_interval', get_setting_text('premium_interval', 'month'),
      'founder_trial_price_cents', get_setting_int('founder_trial_price_cents', 0),
      'founder_premium_months', get_setting_int('founder_premium_months', 6),
      'on_founder_trial', false,
      'effective_price_cents', price_cents,
      'unlimited_likes', false,
      'likes_remaining_today', get_setting_int('free_daily_likes', 10),
      'can_see_who_liked', false,
      'can_use_advanced_filters', false,
      'has_messaging_access', msg_access,
      'has_visibility_access', vis_access,
      'has_francophone_access', fr_access,
      'has_international_access', intl_access,
      'visibilite_until', null,
      'francophone_until', null,
      'international_until', null
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
  essentiel_price_cents := get_setting_int('essentiel_price_cents', 1499);
  visibilite_price_cents := get_setting_int('visibilite_price_cents', 299);
  francophone_price_cents := get_setting_int('francophone_price_cents', 299);
  international_price_cents := get_setting_int('international_price_cents', 599);
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

  msg_access := public.has_messaging_access(uid);
  vis_access := public.has_addon_access(uid, 'visibilite');
  fr_access := public.has_addon_access(uid, 'francophone');
  intl_access := public.has_addon_access(uid, 'international');

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
    'essentiel_price_cents', essentiel_price_cents,
    'visibilite_price_cents', visibilite_price_cents,
    'francophone_price_cents', francophone_price_cents,
    'international_price_cents', international_price_cents,
    'premium_currency', currency,
    'premium_interval', interval_label,
    'founder_trial_price_cents', founder_trial_cents,
    'founder_premium_months', founder_months,
    'on_founder_trial', on_founder_trial,
    'effective_price_cents', effective_price_cents,
    'has_messaging_access', msg_access,
    'has_visibility_access', vis_access,
    'has_francophone_access', fr_access,
    'has_international_access', intl_access,
    'visibilite_until', m.visibilite_until,
    'francophone_until', m.francophone_until,
    'international_until', m.international_until
  ) || public._account_access_phase(uid);
end;
$function$;

-- 13. process_membership_expiry_reminders : Essentiel inclus dans le rappel
--     de renouvellement (B), + nouveau rappel J-7 pour les 3 options (C).
create or replace function public.process_membership_expiry_reminders()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_notif_id uuid;
  trial_notified integer := 0;
  premium_notified integer := 0;
  addon_notified integer := 0;
begin
  perform set_config('row_security', 'off', true);

  -- A. Fin de la période gratuite de lancement (Fondateur ou non), 7 jours avant.
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
        'Tes avantages Membre Fondateur se terminent dans 7 jours. Ton badge honorifique reste acquis à vie ; pense à choisir ton offre (Essentiel, Confort ou Premium) pour continuer à échanger sans interruption.'
      else
        'Ton accès gratuit se termine dans 7 jours. Pense à choisir ton offre (Essentiel, Confort ou Premium) pour continuer à échanger sans interruption.'
      end
    )
    returning id into v_notif_id;

    if v_notif_id is not null then
      perform public.request_social_email(v_notif_id);
      trial_notified := trial_notified + 1;
    end if;

    update public.memberships set trial_expiry_notified_at = now() where user_id = r.user_id;
  end loop;

  -- B. Renouvellement d'un abonnement de palier payant en cours
  --    (Essentiel 14,99 €, Confort 19,99 € ou Premium 24,99 €), 7 jours avant échéance.
  for r in
    select user_id, premium_until
    from public.memberships
    where plan in ('essentiel', 'confort', 'premium')
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

  -- C. Renouvellement d'une option à la carte (Visibilité, Pays francophone,
  --    International), 7 jours avant échéance de chacune.
  for r in
    select user_id, visibilite_until as until_at, 'Visibilité' as label
    from public.memberships
    where visibilite_until is not null
      and visibilite_until between now() and now() + interval '7 days'
      and visibilite_expiry_notified_for is distinct from visibilite_until
    union all
    select user_id, francophone_until as until_at, 'Pays francophone' as label
    from public.memberships
    where francophone_until is not null
      and francophone_until between now() and now() + interval '7 days'
      and francophone_expiry_notified_for is distinct from francophone_until
    union all
    select user_id, international_until as until_at, 'International' as label
    from public.memberships
    where international_until is not null
      and international_until between now() and now() + interval '7 days'
      and international_expiry_notified_for is distinct from international_until
  loop
    insert into public.social_notifications (user_id, kind, title, body)
    values (
      r.user_id,
      'membership_expiring',
      'Ton option ' || r.label || ' se renouvelle bientôt',
      'Ton option ' || r.label || ' arrive à échéance dans 7 jours. Elle se renouvelle automatiquement, sauf résiliation depuis ton profil.'
    )
    returning id into v_notif_id;

    if v_notif_id is not null then
      perform public.request_social_email(v_notif_id);
      addon_notified := addon_notified + 1;
    end if;

    if r.label = 'Visibilité' then
      update public.memberships set visibilite_expiry_notified_for = r.until_at where user_id = r.user_id;
    elsif r.label = 'Pays francophone' then
      update public.memberships set francophone_expiry_notified_for = r.until_at where user_id = r.user_id;
    elsif r.label = 'International' then
      update public.memberships set international_expiry_notified_for = r.until_at where user_id = r.user_id;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'trial_notified', trial_notified,
    'premium_notified', premium_notified,
    'addon_notified', addon_notified
  );
end;
$function$;
