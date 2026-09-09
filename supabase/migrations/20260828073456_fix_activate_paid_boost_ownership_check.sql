-- SECURITY FIX: activate_paid_boost allowed any caller (including anon) to pass an
-- arbitrary p_user_id and have the function grant a "paid" boost to that account
-- without any ownership check, unlike its sibling functions (cancel_paid_premium,
-- grant_founder_first_month_boost, try_claim_founder_slot) which all correctly
-- require auth.uid() = p_user_id. This let anyone mark a boost as payment_status =
-- 'paid' for any user with no real payment. Fix: always derive uid from auth.uid(),
-- and reject the call if a p_user_id is supplied that does not match the caller.

create or replace function public.activate_paid_boost(
  p_user_id uuid default null::uuid,
  p_provider text default 'stripe'::text,
  p_payment_ref text default null::text
)
returns profile_boosts
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  result profile_boosts;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_user_id is not null and p_user_id <> uid then
    raise exception 'not_authorized';
  end if;

  if p_provider is null or p_provider not in ('stripe', 'paypal') then
    raise exception 'invalid_provider';
  end if;

  update profile_boosts
  set ends_at = greatest(ends_at, now()) + interval '24 hours',
      payment_status = 'paid',
      amount_cents = 299
  where user_id = uid
    and payment_status in ('paid', 'simulated')
    and ends_at > now()
  returning * into result;

  if found then
    insert into membership_notifications (user_id, kind, title, body)
    values (
      uid,
      'boost_activated',
      'Boost prolongé',
      'Ton profil reste mis en avant pour 24 heures supplémentaires (paiement confirmé).'
    );
    return result;
  end if;

  insert into profile_boosts (user_id, starts_at, ends_at, payment_status, amount_cents)
  values (uid, now(), now() + interval '24 hours', 'paid', 299)
  returning * into result;

  insert into membership_notifications (user_id, kind, title, body)
  values (
    uid,
    'boost_activated',
    'Boost activé',
    'Ton profil est mis en avant pendant 24 heures (paiement confirmé).'
  );

  return result;
end;
$function$;
