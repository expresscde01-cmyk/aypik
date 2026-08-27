-- Réciprocité match aussi à la clôture par Flash (Like+Flash, Flash+Flash).
-- extrait partagé pour éviter les doublons de match_created avec le trigger likes.

CREATE OR REPLACE FUNCTION public.pair_match_bond_exists(u1 uuid, u2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u1 IS NOT NULL
    AND u2 IS NOT NULL
    AND u1 IS DISTINCT FROM u2
    AND EXISTS (
      SELECT 1
      FROM public.match_bonds mb
      WHERE mb.user_a = LEAST(u1, u2)
        AND mb.user_b = GREATEST(u1, u2)
    );
$$;

REVOKE ALL ON FUNCTION public.pair_match_bond_exists(uuid, uuid) FROM PUBLIC;

-- Clôturer un intérêt mutuel : bond + 2 notifs match_created (CGU).
-- p_closer = celui qui vient d'agir ; p_peer = l'autre.
-- p_peer_signal_flash_id : flash d'origine du peer (si Flash), sinon NULL (Like).
CREATE OR REPLACE FUNCTION public.finalize_reciprocal_match(
  p_closer uuid,
  p_peer uuid,
  p_origin text,
  p_peer_signal_flash_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closer_name text;
  origin_val text;
BEGIN
  IF p_closer IS NULL OR p_peer IS NULL OR p_closer = p_peer THEN
    RETURN false;
  END IF;

  IF public.pair_match_bond_exists(p_closer, p_peer) THEN
    RETURN false;
  END IF;

  origin_val := CASE
    WHEN lower(COALESCE(p_origin, '')) = 'flash' THEN 'flash'
    ELSE 'like'
  END;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO closer_name
  FROM profiles
  WHERE id = p_closer;

  PERFORM public.ensure_match_bond(p_closer, p_peer, origin_val);

  DELETE FROM public.social_notifications
  WHERE kind IN ('flash_received', 'like_received')
    AND (
      (user_id = p_peer AND actor_id = p_closer)
      OR (user_id = p_closer AND actor_id = p_peer)
    );

  -- Peer (intérêt d'origine) : « X a matché ton Flash|Like »
  INSERT INTO social_notifications (
    user_id, kind, title, body, actor_id, flash_id
  )
  VALUES (
    p_peer,
    'match_created',
    'C’est un match !',
    CASE
      WHEN p_peer_signal_flash_id IS NOT NULL THEN
        closer_name || ' a matché ton Flash ⚡'
      ELSE
        closer_name || ' a matché ton Like ❤️'
    END,
    p_closer,
    p_peer_signal_flash_id
  );

  -- Closer (nous validons) → CGU « Matché le »
  INSERT INTO social_notifications (
    user_id, kind, title, body, actor_id, flash_id
  )
  VALUES (
    p_closer,
    'match_created',
    'Matché le',
    'Matché le',
    p_peer,
    p_peer_signal_flash_id
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_reciprocal_match(uuid, uuid, text, uuid) FROM PUBLIC;

-- Trigger Like : même logique, avec garde anti-doublon si le Flash a déjà matché.
CREATE OR REPLACE FUNCTION notify_on_mutual_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
  had_like boolean := false;
  flash_row_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO actor_name
  FROM profiles
  WHERE id = NEW.from_user;

  SELECT EXISTS (
    SELECT 1 FROM likes
    WHERE from_user = NEW.to_user AND to_user = NEW.from_user
  ) INTO had_like;

  SELECT f.id INTO flash_row_id
  FROM flashes f
  WHERE f.from_user = NEW.to_user AND f.to_user = NEW.from_user
  LIMIT 1;

  IF NOT had_like AND flash_row_id IS NULL THEN
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

  -- Déjà matché via Flash (ou autre) : pas de second couple de notifs.
  IF public.pair_match_bond_exists(NEW.from_user, NEW.to_user) THEN
    IF flash_row_id IS NOT NULL AND NOT had_like THEN
      INSERT INTO likes (from_user, to_user)
      VALUES (NEW.to_user, NEW.from_user)
      ON CONFLICT (from_user, to_user) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  PERFORM public.finalize_reciprocal_match(
    NEW.from_user,
    NEW.to_user,
    CASE WHEN flash_row_id IS NOT NULL THEN 'flash' ELSE 'like' END,
    flash_row_id
  );

  IF flash_row_id IS NOT NULL AND NOT had_like THEN
    INSERT INTO likes (from_user, to_user)
    VALUES (NEW.to_user, NEW.from_user)
    ON CONFLICT (from_user, to_user) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION notify_on_mutual_like() FROM PUBLIC;

-- send_flash : même contrôle de réciprocité qu'à l'INSERT like.
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
  matched boolean := false;
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
      'to_user', p_to_user,
      'matched', public.pair_match_bond_exists(me, p_to_user)
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

    matched := public.finalize_reciprocal_match(
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

  RETURN jsonb_build_object(
    'ok', true,
    'already_flashed', false,
    'flash_id', inserted.id,
    'notification_id', notif_id,
    'to_user', p_to_user,
    'from_display_name', actor_name,
    'matched', false,
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
