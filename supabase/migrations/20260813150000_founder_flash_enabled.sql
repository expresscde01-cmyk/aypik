-- Coup de cœur : inclus dans l’offre Fondateur (100 premiers).
-- Mode lancement (payments_enabled = 0) : réservé aux fondateurs.
-- Like reste discret (notif au match uniquement). Flash notifie tout de suite.

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
  is_founder_offer boolean := false;
  unlimited_flash boolean := false;
  free_limit integer;
  used_today integer := 0;
  notif_id uuid;
  my_birth date;
  their_birth date;
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
  is_founder_offer :=
    FOUND AND (COALESCE(m.is_founder, false) OR m.plan = 'founder');

  -- Lancement : flash réservé à l’offre Fondateur (100 premiers).
  IF get_setting_int('payments_enabled', 0) = 0 AND NOT is_founder_offer THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'flash_reserved_for_founders'
    );
  END IF;

  unlimited_flash :=
    is_founder_offer
    OR (
      m.plan = 'premium'
      AND (m.premium_until IS NULL OR m.premium_until > now())
    )
    OR has_active_premium(me);

  SELECT * INTO existing
  FROM flashes
  WHERE from_user = me AND to_user = p_to_user;

  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_flashed', true,
      'flash_id', existing.id,
      'to_user', p_to_user
    );
  END IF;

  free_limit := get_setting_int('free_daily_flashes', 3);

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

  INSERT INTO social_notifications (
    user_id, kind, title, body, actor_id, flash_id
  ) VALUES (
    p_to_user,
    'flash_received',
    'Nouveau coup de cœur',
    actor_name || ' vous a envoyé un coup de cœur ✨',
    me,
    inserted.id
  )
  RETURNING id INTO notif_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_flashed', false,
    'flash_id', inserted.id,
    'notification_id', notif_id,
    'to_user', p_to_user,
    'from_display_name', actor_name,
    'should_notify_email', true,
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

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
