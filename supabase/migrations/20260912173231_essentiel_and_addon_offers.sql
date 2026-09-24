-- Essentiel (14,99€) comme palier réel + 3 options à la carte récurrentes
-- (Visibilité, Pays francophone, International).

-- 1. payment_subscriptions.plan : ajout des 4 nouvelles valeurs.
alter table public.payment_subscriptions drop constraint if exists payment_subscriptions_plan_check;
alter table public.payment_subscriptions add constraint payment_subscriptions_plan_check
  check (plan is null or plan in ('essentiel','confort','premium','visibilite','francophone','international'));

-- 2. memberships : colonnes pour les 3 options à la carte (indépendantes du palier).
alter table public.memberships
  add column if not exists visibilite_until timestamptz,
  add column if not exists francophone_until timestamptz,
  add column if not exists international_until timestamptz,
  add column if not exists visibilite_expiry_notified_for timestamptz,
  add column if not exists francophone_expiry_notified_for timestamptz,
  add column if not exists international_expiry_notified_for timestamptz;

-- 3. Tarifs.
insert into public.platform_settings (key, value) values
  ('essentiel_price_cents', '1499'),
  ('visibilite_price_cents', '299'),
  ('francophone_price_cents', '299'),
  ('international_price_cents', '599')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 4. Bug latent : le rappel J-7 (process_membership_expiry_reminders, déjà en
--    production) insère kind='membership_expiring' dans social_notifications,
--    valeur absente de la contrainte CHECK — chaque exécution du cron
--    échouait silencieusement. On l'ajoute à l'allowlist.
alter table public.social_notifications drop constraint if exists social_notifications_kind_check;
alter table public.social_notifications add constraint social_notifications_kind_check
  check (kind in (
    'flash_received','like_received','match_created','message_received',
    'match_waiting','match_declined','match_wait_reminder','match_wait_expiry',
    'membership_expiring'
  ));

-- 5. Accès messagerie (Dialogue) : Essentiel/Confort/Premium ou encore dans
--    la fenêtre gratuite (phase != post_trial, Fondateur compris).
create or replace function public.has_messaging_access(p_user_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  m memberships%rowtype;
  v_linked boolean;
  v_phase text;
begin
  select * into m from memberships where user_id = p_user_id;
  v_linked := found;

  v_phase := (public._account_access_phase(p_user_id) ->> 'phase');
  if v_phase is distinct from 'post_trial' then
    return true;
  end if;

  if not v_linked then
    return false;
  end if;

  return m.plan in ('essentiel', 'confort', 'premium')
    and (m.premium_until is null or m.premium_until > now());
end;
$$;

-- 6. Accès aux 3 options à la carte : gratuit tant que la fenêtre d'essai
--    n'est pas terminée ; ensuite, inclus dans Premium (24,99 €), ou via
--    l'abonnement dédié. L'option International inclut Pays francophone
--    (elle couvre un périmètre plus large).
create or replace function public.has_addon_access(p_user_id uuid, p_addon text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  m memberships%rowtype;
  v_linked boolean;
  v_phase text;
  v_premium_active boolean;
begin
  select * into m from memberships where user_id = p_user_id;
  v_linked := found;

  v_phase := (public._account_access_phase(p_user_id) ->> 'phase');
  if v_phase is distinct from 'post_trial' then
    return true;
  end if;

  if not v_linked then
    return false;
  end if;

  v_premium_active := m.plan = 'premium'
    and (m.premium_until is null or m.premium_until > now());
  if v_premium_active then
    return true;
  end if;

  if p_addon = 'visibilite' then
    return m.visibilite_until is not null and m.visibilite_until > now();
  elsif p_addon = 'francophone' then
    if m.francophone_until is not null and m.francophone_until > now() then
      return true;
    end if;
    return m.international_until is not null and m.international_until > now();
  elsif p_addon = 'international' then
    return m.international_until is not null and m.international_until > now();
  else
    return false;
  end if;
end;
$$;

-- 7. insert_chat_message : Essentiel (et pas seulement Confort/Premium)
--    débloque l'envoi de nouveaux messages après la fenêtre gratuite.
create or replace function public.insert_chat_message(p_recipient uuid, p_content text)
returns messages
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  me uuid := auth.uid();
  cleaned text := btrim(COALESCE(p_content, ''));
  a uuid;
  b uuid;
  conv_id uuid;
  row_out public.messages;
  recipient_open_messaging boolean;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_recipient IS NULL OR p_recipient = me THEN
    RAISE EXCEPTION 'invalid_participant';
  END IF;
  IF cleaned = '' THEN
    RAISE EXCEPTION 'empty_message';
  END IF;
  IF public.profile_is_deactivated(p_recipient)
    OR public.profile_is_deactivated(me) THEN
    RAISE EXCEPTION 'member_unavailable';
  END IF;

  IF NOT public.has_messaging_access(me) THEN
    RAISE EXCEPTION 'payment_required';
  END IF;

  SELECT (discover_mode = 'simplifie') INTO recipient_open_messaging
  FROM public.profiles
  WHERE id = p_recipient;

  IF NOT public.users_are_matched(me, p_recipient)
     AND NOT COALESCE(recipient_open_messaging, false) THEN
    RAISE EXCEPTION 'not_matched';
  END IF;

  a := LEAST(me, p_recipient);
  b := GREATEST(me, p_recipient);

  SELECT id INTO conv_id
  FROM public.conversations
  WHERE user_a = a AND user_b = b;

  IF conv_id IS NULL THEN
    INSERT INTO public.conversations (user_a, user_b)
    VALUES (a, b)
    ON CONFLICT (user_a, user_b) DO NOTHING;

    SELECT id INTO conv_id
    FROM public.conversations
    WHERE user_a = a AND user_b = b;
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, recipient_id, content)
  VALUES (conv_id, me, p_recipient, cleaned)
  RETURNING * INTO row_out;

  RETURN row_out;
END;
$function$;

-- 8. activate_paid_premium : accepte désormais 'essentiel'.
create or replace function public.activate_paid_premium(
  p_user_id uuid,
  p_provider text,
  p_period_end timestamp with time zone default null::timestamp with time zone,
  p_plan text default 'confort'::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan text := case when p_plan in ('essentiel', 'confort', 'premium') then p_plan else 'confort' end;
  v_offer_label text := case v_plan
    when 'premium' then 'Premium'
    when 'essentiel' then 'Essentiel'
    else 'Confort'
  end;
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
$function$;

-- 9. activate_paid_addon : active l'une des 3 options à la carte (indépendant du palier).
create or replace function public.activate_paid_addon(
  p_user_id uuid,
  p_provider text,
  p_addon text,
  p_period_end timestamptz default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_addon text := case when p_addon in ('visibilite','francophone','international') then p_addon else null end;
  v_until timestamptz := coalesce(p_period_end, now() + interval '1 month');
  v_label text;
begin
  if v_addon is null then
    raise exception 'invalid_addon';
  end if;

  perform set_config('aypik.allow_paid_meta', '1', true);

  insert into public.memberships (user_id, plan)
  values (p_user_id, 'free')
  on conflict (user_id) do nothing;

  if v_addon = 'visibilite' then
    update public.memberships set visibilite_until = v_until, updated_at = now() where user_id = p_user_id;
    v_label := 'Visibilité';
  elsif v_addon = 'francophone' then
    update public.memberships set francophone_until = v_until, updated_at = now() where user_id = p_user_id;
    v_label := 'Pays francophone';
  elsif v_addon = 'international' then
    update public.memberships set international_until = v_until, updated_at = now() where user_id = p_user_id;
    v_label := 'International';
  end if;

  insert into public.membership_notifications (user_id, kind, title, body)
  values (
    p_user_id,
    'premium_activated',
    v_label || ' actif',
    'Merci ! Ton option ' || v_label || ' est active. Tu peux la résilier à tout moment en un clic depuis ton profil.'
  );
end;
$$;

-- 10. cancel_paid_premium : ne doit annuler que les abonnements de palier
--     (essentiel/confort/premium), pas les options à la carte indépendantes.
create or replace function public.cancel_paid_premium(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  m memberships%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO m FROM memberships WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF m.is_founder
     AND m.founder_premium_until IS NOT NULL
     AND m.founder_premium_until > now() THEN
    UPDATE memberships
    SET plan = 'founder',
        payment_provider = 'founder',
        updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE memberships
    SET plan = 'free',
        premium_until = NULL,
        payment_provider = NULL,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  UPDATE payment_subscriptions
  SET status = 'canceled',
      cancel_at_period_end = true,
      updated_at = now()
  WHERE user_id = p_user_id
    AND status IN ('active', 'past_due', 'incomplete', 'pending')
    AND (plan IS NULL OR plan IN ('essentiel', 'confort', 'premium'));
END;
$function$;

-- 11. cancel_paid_addon : annule uniquement l'option ciblée.
create or replace function public.cancel_paid_addon(p_user_id uuid, p_addon text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_addon text := case when p_addon in ('visibilite','francophone','international') then p_addon else null end;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not_authorized';
  end if;
  if v_addon is null then
    raise exception 'invalid_addon';
  end if;

  if v_addon = 'visibilite' then
    update public.memberships set visibilite_until = null, updated_at = now() where user_id = p_user_id;
  elsif v_addon = 'francophone' then
    update public.memberships set francophone_until = null, updated_at = now() where user_id = p_user_id;
  elsif v_addon = 'international' then
    update public.memberships set international_until = null, updated_at = now() where user_id = p_user_id;
  end if;

  update public.payment_subscriptions
  set status = 'canceled', cancel_at_period_end = true, updated_at = now()
  where user_id = p_user_id
    and plan = v_addon
    and status in ('active','past_due','incomplete','pending');
end;
$$;
