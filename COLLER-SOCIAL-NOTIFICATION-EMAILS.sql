-- E-mails sociaux (Like / Flash / Match) déclenchés côté serveur via pg_net.
-- Prérequis : appliquer aussi (ou avoir déjà) la réciprocité Flash→match.
-- Config obligatoire après collage : voir INSERT email_dispatch_settings en bas.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ===== Config dispatch (service only) =====
CREATE TABLE IF NOT EXISTS public.email_dispatch_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  functions_base_url text NOT NULL,
  hook_secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.email_dispatch_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.email_dispatch_settings FROM anon, authenticated;
-- Lecture uniquement via fonctions SECURITY DEFINER ci-dessous.

CREATE OR REPLACE FUNCTION public.mark_notification_emailed(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE social_notifications
  SET email_sent_at = COALESCE(email_sent_at, now())
  WHERE id = p_notification_id
    AND kind IN ('flash_received', 'like_received', 'match_created');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_emailed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_emailed(uuid) TO service_role;

-- Compat : l'ancienne RPC Flash pointe vers la nouvelle.
CREATE OR REPLACE FUNCTION public.mark_flash_notification_emailed(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.mark_notification_emailed(p_notification_id);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_flash_notification_emailed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_flash_notification_emailed(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.request_social_email(p_notification_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings public.email_dispatch_settings%ROWTYPE;
  req_id bigint;
  endpoint text;
BEGIN
  IF p_notification_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO settings
  FROM public.email_dispatch_settings
  WHERE id = true;

  IF NOT FOUND
     OR NULLIF(trim(settings.functions_base_url), '') IS NULL
     OR NULLIF(trim(settings.hook_secret), '') IS NULL THEN
    RAISE WARNING 'email_dispatch_settings manquant — e-mail non envoyé (%)',
      p_notification_id;
    RETURN NULL;
  END IF;

  endpoint := regexp_replace(trim(settings.functions_base_url), '/$', '')
    || '/send-social-email';

  SELECT net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-aypik-email-secret', settings.hook_secret
    ),
    body := jsonb_build_object('notificationId', p_notification_id)
  ) INTO req_id;

  RETURN req_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'request_social_email failed: %', SQLERRM;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.request_social_email(uuid) FROM PUBLIC;

-- ===== Helpers réciprocité (réaffirmés + e-mails) =====
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
  peer_notif_id uuid;
  closer_notif_id uuid;
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
  )
  RETURNING id INTO peer_notif_id;

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
  )
  RETURNING id INTO closer_notif_id;

  PERFORM public.request_social_email(peer_notif_id);
  PERFORM public.request_social_email(closer_notif_id);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_reciprocal_match(uuid, uuid, text, uuid) FROM PUBLIC;

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
  like_notif_id uuid;
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
    )
    RETURNING id INTO like_notif_id;

    PERFORM public.request_social_email(like_notif_id);
    RETURN NEW;
  END IF;

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

NOTIFY pgrst, 'reload schema';

-- ===== CONFIG À REMPLIR (une fois) =====
-- 1) Déploie la function : npx supabase functions deploy send-social-email --project-ref dtsyeouinmpjvdgwkncu
-- 2) Secrets :
--    npx supabase secrets set EMAIL_HOOK_SECRET="…long random…" --project-ref dtsyeouinmpjvdgwkncu
--    npx supabase secrets set RESEND_API_KEY=re_… --project-ref dtsyeouinmpjvdgwkncu
--    npx supabase secrets set RESEND_FROM_EMAIL="Aypik <bonjour@ton-domaine.fr>" --project-ref dtsyeouinmpjvdgwkncu
--    npx supabase secrets set PUBLIC_SITE_URL=https://aypik.fr --project-ref dtsyeouinmpjvdgwkncu
-- 3) Puis exécute (même secret que EMAIL_HOOK_SECRET) :
--
-- INSERT INTO public.email_dispatch_settings (id, functions_base_url, hook_secret)
-- VALUES (
--   true,
--   'https://dtsyeouinmpjvdgwkncu.supabase.co/functions/v1',
--   'REMPLACER_PAR_LE_MEME_SECRET_QUE_EMAIL_HOOK_SECRET'
-- )
-- ON CONFLICT (id) DO UPDATE
-- SET functions_base_url = EXCLUDED.functions_base_url,
--     hook_secret = EXCLUDED.hook_secret,
--     updated_at = now();
