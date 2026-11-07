-- Retour arrière de 20261107191000_lock_client_writes.
-- À lancer à la main seulement si l'étape 1 doit être annulée.
-- Ce fichier n'est pas dans supabase/migrations : supabase db push ne l'applique pas.
-- La couleur du prénom (20261106140000) n'est pas annulée ici.

DROP TRIGGER IF EXISTS messages_protect_sent ON public.messages;
DROP FUNCTION IF EXISTS public.protect_sent_message();

DROP TRIGGER IF EXISTS conversations_protect_pair ON public.conversations;
DROP FUNCTION IF EXISTS public.protect_conversation_pair();

DROP TRIGGER IF EXISTS memberships_protect_privileged_columns ON public.memberships;
DROP FUNCTION IF EXISTS public.protect_membership_privileged_columns();

DROP FUNCTION IF EXISTS public.send_like(uuid);

CREATE OR REPLACE FUNCTION public.send_like(p_to_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  actor_name text;
  target_exists boolean;
  my_birth date;
  their_birth date;
  m memberships%ROWTYPE;
  unlimited_likes boolean := false;
  free_limit integer;
  used_today integer := 0;
  existing_like uuid;
  inserted_like uuid;
  notif_id uuid;
  had_reverse boolean := false;
  had_flash boolean := false;
  matched boolean := false;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_to_user IS NULL OR p_to_user = me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  -- Aligné Flash : has_children faux (NULL traité comme faux) ; ignore soft-delete
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_to_user
      AND COALESCE(has_children, false) = false
      AND deletion_requested_at IS NULL
  ) INTO target_exists;

  IF NOT target_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  SELECT birth_date INTO my_birth FROM profiles WHERE id = me;
  SELECT birth_date INTO their_birth FROM profiles WHERE id = p_to_user;

  -- Anciens profils : si une date manque, on n’bloque pas l’envoi (Flash était aussi strict ;
  -- ici on autorise pour ne pas perdre la notif sur données incomplètes).
  IF my_birth IS NOT NULL
     AND their_birth IS NOT NULL
     AND NOT public.dating_partner_old_enough(my_birth, their_birth) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'age_rule_violation');
  END IF;

  SELECT id INTO existing_like
  FROM likes
  WHERE from_user = me AND to_user = p_to_user
  LIMIT 1;

  IF existing_like IS NOT NULL THEN
    -- Rattrapage : like déjà là mais pas de notif (ère « like discret »)
    SELECT COALESCE(NULLIF(btrim(display_name), ''), 'Quelqu’un')
    INTO actor_name
    FROM profiles
    WHERE id = me;
    actor_name := COALESCE(NULLIF(btrim(actor_name), ''), 'Quelqu’un');

    SELECT EXISTS (
      SELECT 1 FROM likes
      WHERE from_user = p_to_user AND to_user = me
    ) INTO had_reverse;

    SELECT EXISTS (
      SELECT 1 FROM flashes
      WHERE from_user = p_to_user AND to_user = me
    ) INTO had_flash;

    IF NOT had_reverse AND NOT had_flash THEN
      SELECT id INTO notif_id
      FROM social_notifications
      WHERE user_id = p_to_user
        AND actor_id = me
        AND kind = 'like_received'
        AND read_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1;

      IF notif_id IS NULL THEN
        INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
        VALUES (
          p_to_user,
          'like_received',
          'Nouveau Like',
          actor_name || ' t''a envoyé un Like ❤️',
          me
        )
        RETURNING id INTO notif_id;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'already_liked', true,
      'like_id', existing_like,
      'notification_id', notif_id,
      'to_user', p_to_user,
      'from_display_name', actor_name
    );
  END IF;

  SELECT * INTO m FROM memberships WHERE user_id = me;
  unlimited_likes :=
    (
      COALESCE(m.is_founder, false)
      AND m.founder_premium_until IS NOT NULL
      AND m.founder_premium_until > now()
    )
    OR (
      m.plan = 'premium'
      AND (m.premium_until IS NULL OR m.premium_until > now())
    )
    OR public.has_active_premium(me);

  free_limit := COALESCE(get_setting_int('free_daily_likes', 10), 10);

  IF NOT unlimited_likes THEN
    SELECT COUNT(*)::integer INTO used_today
    FROM likes
    WHERE from_user = me
      AND created_at >= date_trunc('day', now());

    IF used_today >= free_limit THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'like_quota_exhausted',
        'likes_remaining_today', 0,
        'free_daily_likes', free_limit
      );
    END IF;
  END IF;

  INSERT INTO likes (from_user, to_user)
  VALUES (me, p_to_user)
  RETURNING id INTO inserted_like;

  SELECT COALESCE(NULLIF(btrim(display_name), ''), 'Quelqu’un')
  INTO actor_name
  FROM profiles
  WHERE id = me;
  actor_name := COALESCE(NULLIF(btrim(actor_name), ''), 'Quelqu’un');

  SELECT EXISTS (
    SELECT 1 FROM likes
    WHERE from_user = p_to_user AND to_user = me
  ) INTO had_reverse;

  SELECT EXISTS (
    SELECT 1 FROM flashes
    WHERE from_user = p_to_user AND to_user = me
  ) INTO had_flash;

  matched := had_reverse OR had_flash;

  IF NOT matched THEN
    SELECT id INTO notif_id
    FROM social_notifications
    WHERE user_id = p_to_user
      AND actor_id = me
      AND kind = 'like_received'
      AND read_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF notif_id IS NULL THEN
      INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
      VALUES (
        p_to_user,
        'like_received',
        'Nouveau Like',
        actor_name || ' t''a envoyé un Like ❤️',
        me
      )
      RETURNING id INTO notif_id;
    END IF;
  ELSE
    SELECT id INTO notif_id
    FROM social_notifications
    WHERE user_id = p_to_user
      AND actor_id = me
      AND kind = 'match_created'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already_liked', false,
    'like_id', inserted_like,
    'notification_id', notif_id,
    'to_user', p_to_user,
    'from_display_name', actor_name,
    'matched', matched,
    'likes_remaining_today', CASE
      WHEN unlimited_likes THEN NULL
      ELSE GREATEST(free_limit - used_today - 1, 0)
    END,
    'free_daily_likes', free_limit
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.send_like(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_like(uuid) TO authenticated;

DROP POLICY IF EXISTS "messages_insert_authenticated" ON public.messages;
CREATE POLICY "messages_insert_authenticated"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = sender_id
  AND sender_id <> recipient_id
);

DROP POLICY IF EXISTS "conversations_insert_participants" ON public.conversations;
CREATE POLICY "conversations_insert_participants"
ON public.conversations FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_a
  OR (SELECT auth.uid()) = user_b
);

DROP POLICY IF EXISTS "likes_insert_own" ON public.likes;
CREATE POLICY "likes_insert_own"
ON public.likes FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = from_user);

DROP POLICY IF EXISTS "flashes_insert_own" ON public.flashes;
CREATE POLICY "flashes_insert_own"
ON public.flashes FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = from_user);

DROP POLICY IF EXISTS "boosts_insert_own" ON public.profile_boosts;
CREATE POLICY "boosts_insert_own"
ON public.profile_boosts FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.memberships TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.messages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.conversations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.profile_boosts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.likes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.flashes TO anon, authenticated;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20261107191000';

NOTIFY pgrst, 'reload schema';
