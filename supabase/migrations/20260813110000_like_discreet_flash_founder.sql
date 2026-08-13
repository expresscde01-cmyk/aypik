-- Like discret (notif uniquement au match) + coup de cœur hors offre Fondateur.
-- Boost et flash restent dans le code ; les fondateurs n’y ont pas droit.

-- ===== Match : notifier les deux profils seulement si le like est réciproque =====
CREATE OR REPLACE FUNCTION notify_on_mutual_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
  target_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM likes
    WHERE from_user = NEW.to_user
      AND to_user = NEW.from_user
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO actor_name
  FROM profiles
  WHERE id = NEW.from_user;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO target_name
  FROM profiles
  WHERE id = NEW.to_user;

  INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
  VALUES (
    NEW.to_user,
    'match_created',
    'C’est un match !',
    actor_name || ' a liké en retour — vous pouvez discuter.',
    NEW.from_user
  );

  INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
  VALUES (
    NEW.from_user,
    'match_created',
    'C’est un match !',
    target_name || ' vous a aussi liké — vous pouvez discuter.',
    NEW.to_user
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS likes_notify_on_match ON likes;
CREATE TRIGGER likes_notify_on_match
AFTER INSERT ON likes
FOR EACH ROW
EXECUTE FUNCTION notify_on_mutual_like();

-- ===== send_flash : notifie tout de suite, interdit aux fondateurs =====
-- Premium payant : illimité. Freemium : quota journalier. Fondateur : bloqué (comme Boost).
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
  paid_premium boolean := false;
  free_limit integer;
  used_today integer := 0;
  notif_id uuid;
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

  SELECT * INTO m FROM memberships WHERE user_id = me;
  IF m.is_founder OR m.plan = 'founder' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'flash_not_available_for_founders'
    );
  END IF;

  paid_premium :=
    m.plan = 'premium'
    AND (m.premium_until IS NULL OR m.premium_until > now());

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

  IF NOT paid_premium THEN
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
      WHEN paid_premium THEN NULL
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
