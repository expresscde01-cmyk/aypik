-- Nomenclature unique : Nouveau Like / Nouveau Flash (plus de « coup de cœur »).

CREATE OR REPLACE FUNCTION notify_on_mutual_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
  target_name text;
  is_mutual boolean := false;
BEGIN
  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO actor_name
  FROM profiles
  WHERE id = NEW.from_user;

  SELECT EXISTS (
    SELECT 1
    FROM likes
    WHERE from_user = NEW.to_user
      AND to_user = NEW.from_user
  ) INTO is_mutual;

  IF NOT is_mutual THEN
    INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
    VALUES (
      NEW.to_user,
      'like_received',
      'Nouveau Like',
      actor_name || ' t''a envoyé un Like ❤️',
      NEW.from_user
    );
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO target_name
  FROM profiles
  WHERE id = NEW.to_user;

  INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
  VALUES (
    NEW.to_user,
    'match_created',
    'C’est un match !',
    actor_name || ' a liké en retour — tu peux discuter.',
    NEW.from_user
  );

  INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
  VALUES (
    NEW.from_user,
    'match_created',
    'C’est un match !',
    target_name || ' t''a aussi liké — tu peux discuter.',
    NEW.to_user
  );

  RETURN NEW;
END;
$$;

UPDATE social_notifications
SET
  title = CASE
    WHEN kind = 'flash_received' THEN 'Nouveau Flash'
    WHEN kind = 'like_received'
      OR title ILIKE '%coup de c%'
      OR title ILIKE '%nouveau like%'
      THEN 'Nouveau Like'
    ELSE title
  END,
  body = CASE
    WHEN kind = 'flash_received' THEN
      regexp_replace(
        regexp_replace(body, 'coup de c[œe]ur', 'Flash', 'gi'),
        ' t''a envoyé un [^[:cntrl:]]+$',
        ' t''a envoyé un Flash ⚡'
      )
    WHEN kind = 'like_received'
      OR body ILIKE '%coup de c%' THEN
      regexp_replace(
        regexp_replace(body, 'coup de c[œe]ur', 'Like', 'gi'),
        ' t''a envoyé un [^[:cntrl:]]+$',
        ' t''a envoyé un Like ❤️'
      )
    ELSE replace(replace(body, 'coup de cœur', 'Like'), 'coup de coeur', 'Like')
  END
WHERE kind IN ('like_received', 'flash_received')
   OR title ILIKE '%coup de c%'
   OR body ILIKE '%coup de c%'
   OR title ILIKE '%nouveau like%'
   OR title ILIKE '%nouveau flash%'
   OR body ILIKE '%un like%'
   OR body ILIKE '%un flash%';

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

  unlimited_flash :=
    founder_window
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
    'Nouveau Flash',
    actor_name || ' t''a envoyé un Flash ⚡',
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
