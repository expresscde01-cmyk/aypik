-- Quotas flash par palier (Gratuit 2, Basique 2, Essentiel 3, Confort/Premium illimité).
-- À appliquer après offer_grid_v3 (offer_daily_flash_limit / offer_unlimited_likes_flashes).
-- Corps aligné sur send_flash de social_notification_emails (réciprocité + e-mail).
-- UTF-8 : ne pas réécrire via PowerShell Set-Content.

CREATE OR REPLACE FUNCTION send_flash(p_to_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  existing flashes%ROWTYPE;
  inserted flashes%ROWTYPE;
  actor_name text;
  target_exists boolean;
  m memberships%ROWTYPE;
  founder_window boolean := false;
  unlimited_flash boolean := false;
  free_limit integer;
  used_today integer := 0;
  notif_id uuid;
  my_birth date;
  their_birth date;
  had_like boolean := false;
  reverse_flash_id uuid;
  bond_origin text;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_to_user IS NULL OR p_to_user = me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_to_user AND has_children = false
  ) INTO target_exists;

  IF NOT target_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  SELECT birth_date INTO my_birth FROM profiles WHERE id = me;
  SELECT birth_date INTO their_birth FROM profiles WHERE id = p_to_user;

  IF my_birth IS NULL OR their_birth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF NOT public.dating_partner_old_enough(my_birth, their_birth) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'age_rule_violation');
  END IF;

  SELECT * INTO m FROM memberships WHERE user_id = me;
  founder_window :=
    FOUND
    AND COALESCE(m.is_founder, false)
    AND m.founder_premium_until IS NOT NULL
    AND m.founder_premium_until > now();

  IF get_setting_int('payments_enabled', 0) = 0 AND NOT founder_window THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'flash_reserved_for_founders'
    );
  END IF;

  unlimited_flash := public.offer_unlimited_likes_flashes(me);

  SELECT * INTO existing
  FROM flashes
  WHERE from_user = me AND to_user = p_to_user;

  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_flashed', true,
      'flash_id', existing.id,
      'to_user', p_to_user,
      'matched', public.pair_match_bond_exists(me, p_to_user)
    );
  END IF;

  free_limit := COALESCE(public.offer_daily_flash_limit(me), 2);

  IF NOT unlimited_flash THEN
    SELECT COUNT(*)::integer INTO used_today
    FROM flashes
    WHERE from_user = me
      AND created_at >= date_trunc('day', now());

    IF used_today >= free_limit THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'flash_quota_exhausted',
        'flashes_remaining_today', 0,
        'free_daily_flashes', free_limit
      );
    END IF;
  END IF;

  INSERT INTO flashes (from_user, to_user)
  VALUES (me, p_to_user)
  RETURNING * INTO inserted;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO actor_name
  FROM profiles
  WHERE id = me;

  SELECT EXISTS (
    SELECT 1 FROM likes
    WHERE from_user = p_to_user AND to_user = me
  ) INTO had_like;

  SELECT f.id INTO reverse_flash_id
  FROM flashes f
  WHERE f.from_user = p_to_user AND f.to_user = me
  LIMIT 1;

  IF had_like OR reverse_flash_id IS NOT NULL THEN
    bond_origin := CASE
      WHEN reverse_flash_id IS NOT NULL THEN 'flash'
      ELSE 'like'
    END;

    PERFORM public.finalize_reciprocal_match(
      me,
      p_to_user,
      bond_origin,
      reverse_flash_id
    );

    RETURN jsonb_build_object(
      'ok', true,
      'already_flashed', false,
      'flash_id', inserted.id,
      'to_user', p_to_user,
      'from_display_name', actor_name,
      'matched', true,
      'should_notify_email', false,
      'flashes_remaining_today', CASE
        WHEN unlimited_flash THEN NULL
        ELSE GREATEST(free_limit - used_today - 1, 0)
      END,
      'free_daily_flashes', free_limit
    );
  END IF;

  INSERT INTO social_notifications (
    user_id, kind, title, body, actor_id, flash_id
  ) VALUES (
    p_to_user,
    'flash_received',
    'Nouveau Flash',
    actor_name || ' t''a envoyé un Flash ⚡',
    me,
    inserted.id
  )
  RETURNING id INTO notif_id;

  PERFORM public.request_social_email(notif_id);

  RETURN jsonb_build_object(
    'ok', true,
    'already_flashed', false,
    'flash_id', inserted.id,
    'notification_id', notif_id,
    'to_user', p_to_user,
    'from_display_name', actor_name,
    'matched', false,
    'should_notify_email', false,
    'flashes_remaining_today', CASE
      WHEN unlimited_flash THEN NULL
      ELSE GREATEST(free_limit - used_today - 1, 0)
    END,
    'free_daily_flashes', free_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION send_flash(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION send_flash(uuid) TO authenticated;
