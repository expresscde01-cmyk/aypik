/*
# Flashes (coups de cœur), notifications sociales & suggestions

## Tables
- flashes : un utilisateur envoie un coup de cœur à un profil
- social_notifications : inbox in-app (flash_received, …)

## RPCs
- send_flash(p_to_user) : insert flash + notification (quota free)
- get_my_social_notifications / mark_social_notification_read
- suggest_profiles(...) : ranking ville + âge + centres d’intérêt
*/

-- ===== Flashes =====
CREATE TABLE IF NOT EXISTS flashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_user, to_user),
  CHECK (from_user <> to_user)
);

CREATE INDEX IF NOT EXISTS idx_flashes_from_user ON flashes(from_user);
CREATE INDEX IF NOT EXISTS idx_flashes_to_user ON flashes(to_user);
CREATE INDEX IF NOT EXISTS idx_flashes_created_at ON flashes(created_at DESC);

ALTER TABLE flashes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flashes_select_own" ON flashes;
CREATE POLICY "flashes_select_own"
ON flashes FOR SELECT
TO authenticated
USING (auth.uid() = from_user OR auth.uid() = to_user);

DROP POLICY IF EXISTS "flashes_insert_own" ON flashes;
CREATE POLICY "flashes_insert_own"
ON flashes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = from_user);

DROP POLICY IF EXISTS "flashes_delete_own" ON flashes;
CREATE POLICY "flashes_delete_own"
ON flashes FOR DELETE
TO authenticated
USING (auth.uid() = from_user);

-- ===== Social notifications =====
CREATE TABLE IF NOT EXISTS social_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('flash_received', 'like_received', 'match_created')),
  title text NOT NULL,
  body text NOT NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  flash_id uuid REFERENCES flashes(id) ON DELETE SET NULL,
  read_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_notifications_user
  ON social_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_notifications_unread
  ON social_notifications(user_id)
  WHERE read_at IS NULL;

ALTER TABLE social_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_notifications_select_own" ON social_notifications;
CREATE POLICY "social_notifications_select_own"
ON social_notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "social_notifications_update_own" ON social_notifications;
CREATE POLICY "social_notifications_update_own"
ON social_notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Pas d’INSERT client : écriture via SECURITY DEFINER uniquement

INSERT INTO platform_settings (key, value)
VALUES ('free_daily_flashes', '3'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ===== send_flash =====
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
  premium boolean;
  free_limit integer;
  used_today integer;
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

  SELECT * INTO existing
  FROM flashes
  WHERE from_user = me AND to_user = p_to_user;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_flashed', true,
      'flash_id', existing.id,
      'to_user', p_to_user
    );
  END IF;

  premium := has_active_premium(me);
  free_limit := get_setting_int('free_daily_flashes', 3);

  IF NOT premium THEN
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
      WHEN premium THEN NULL
      ELSE GREATEST(free_limit - used_today - 1, 0)
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION send_flash(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION send_flash(uuid) TO authenticated;

-- ===== Notifications helpers =====
CREATE OR REPLACE FUNCTION get_my_social_notifications(p_limit integer DEFAULT 30)
RETURNS SETOF social_notifications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM social_notifications
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 30), 1);
$$;

REVOKE ALL ON FUNCTION get_my_social_notifications(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_social_notifications(integer) TO authenticated;

CREATE OR REPLACE FUNCTION mark_social_notification_read(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  UPDATE social_notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = p_id AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION mark_social_notification_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_social_notification_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION mark_all_social_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE social_notifications
  SET read_at = now()
  WHERE user_id = auth.uid() AND read_at IS NULL;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION mark_all_social_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_all_social_notifications_read() TO authenticated;

CREATE OR REPLACE FUNCTION count_unread_social_notifications()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM social_notifications
  WHERE user_id = auth.uid() AND read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION count_unread_social_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION count_unread_social_notifications() TO authenticated;

-- Marquage e-mail (appelé par edge function service role)
CREATE OR REPLACE FUNCTION mark_flash_notification_emailed(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE social_notifications
  SET email_sent_at = COALESCE(email_sent_at, now())
  WHERE id = p_notification_id
    AND kind = 'flash_received';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION mark_flash_notification_emailed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_flash_notification_emailed(uuid) TO service_role;

-- ===== Suggestions =====
CREATE OR REPLACE FUNCTION suggest_profiles(
  p_limit integer DEFAULT 20,
  p_same_city_only boolean DEFAULT false,
  p_min_interest_overlap integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  display_name text,
  birth_date date,
  bio text,
  has_children boolean,
  location text,
  interests text[],
  photo_url text,
  created_at timestamptz,
  updated_at timestamptz,
  score numeric,
  mutual_interest_count integer,
  same_city boolean,
  same_department boolean,
  age integer,
  is_boosted boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_birth date;
  my_age integer;
  my_min_age integer;
  my_location text;
  my_city text;
  my_dept text;
  my_interests text[];
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  SELECT p.birth_date, p.location, COALESCE(p.interests, '{}')
  INTO my_birth, my_location, my_interests
  FROM profiles p
  WHERE p.id = me;

  IF my_birth IS NULL THEN
    RETURN;
  END IF;

  my_age := EXTRACT(YEAR FROM age(current_date, my_birth))::integer;
  my_min_age := (my_age / 2) + 7;

  my_city := lower(trim(regexp_replace(COALESCE(my_location, ''), '\s*\(.*$', '')));
  my_dept := substring(COALESCE(my_location, '') from '\((\d{2})');

  RETURN QUERY
  WITH liked AS (
    SELECT l.to_user AS uid FROM likes l WHERE l.from_user = me
  ),
  flashed AS (
    SELECT f.to_user AS uid FROM flashes f WHERE f.from_user = me
  ),
  candidates AS (
    SELECT
      p.*,
      EXTRACT(YEAR FROM age(current_date, p.birth_date))::integer AS cand_age,
      (
        SELECT COUNT(*)::integer
        FROM unnest(COALESCE(p.interests, '{}')) i
        WHERE i = ANY (my_interests)
      ) AS overlap,
      lower(trim(regexp_replace(COALESCE(p.location, ''), '\s*\(.*$', ''))) AS cand_city,
      substring(COALESCE(p.location, '') from '\((\d{2})') AS cand_dept,
      EXISTS (
        SELECT 1 FROM profile_boosts b
        WHERE b.user_id = p.id
          AND b.payment_status IN ('paid', 'simulated')
          AND b.ends_at > now()
      ) AS boosted
    FROM profiles p
    WHERE p.id <> me
      AND p.has_children = false
      AND p.id NOT IN (SELECT uid FROM liked)
      AND p.id NOT IN (SELECT uid FROM flashed)
  ),
  scored AS (
    SELECT
      c.*,
      (
        (c.overlap * 40)::numeric
        + CASE
            WHEN COALESCE(my_location, '') <> '' AND c.location = my_location THEN 35
            WHEN my_city <> '' AND c.cand_city = my_city THEN 28
            WHEN my_dept IS NOT NULL AND c.cand_dept = my_dept THEN 15
            ELSE 0
          END
        + GREATEST(0, 20 - ABS(c.cand_age - my_age))::numeric
        + CASE WHEN c.boosted THEN 25 ELSE 0 END
      ) AS rank_score,
      (COALESCE(my_location, '') <> '' AND c.location = my_location)
        OR (my_city <> '' AND c.cand_city = my_city) AS city_match,
      (my_dept IS NOT NULL AND c.cand_dept = my_dept) AS dept_match
    FROM candidates c
    WHERE c.cand_age >= my_min_age
      AND my_age >= ((c.cand_age / 2) + 7)
      AND c.overlap >= GREATEST(COALESCE(p_min_interest_overlap, 0), 0)
      AND (
        NOT COALESCE(p_same_city_only, false)
        OR (
          (COALESCE(my_location, '') <> '' AND c.location = my_location)
          OR (my_city <> '' AND c.cand_city = my_city)
        )
      )
  )
  SELECT
    s.id,
    s.display_name,
    s.birth_date,
    s.bio,
    s.has_children,
    s.location,
    s.interests,
    s.photo_url,
    s.created_at,
    s.updated_at,
    s.rank_score,
    s.overlap,
    s.city_match,
    s.dept_match,
    s.cand_age,
    s.boosted
  FROM scored s
  ORDER BY s.rank_score DESC, s.boosted DESC, s.created_at DESC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 20), 50), 1);
END;
$$;

REVOKE ALL ON FUNCTION suggest_profiles(integer, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION suggest_profiles(integer, boolean, integer) TO authenticated;
