-- Réponses Flash / Like : Matcher | Attendre | Refuser
-- Attendre → notif à l’émetteur : « Alex a mis ton Flash/Like en attente »

CREATE TABLE IF NOT EXISTS public.inbox_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('wait', 'refuse', 'match')),
  origin text NOT NULL CHECK (origin IN ('flash', 'like')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_responses_pair_unique UNIQUE (user_id, actor_id),
  CONSTRAINT inbox_responses_not_self CHECK (user_id <> actor_id)
);

CREATE INDEX IF NOT EXISTS inbox_responses_user_idx
  ON public.inbox_responses (user_id, decision);

ALTER TABLE public.inbox_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbox_responses_select_own" ON public.inbox_responses;
CREATE POLICY "inbox_responses_select_own"
ON public.inbox_responses FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "inbox_responses_insert_own" ON public.inbox_responses;
CREATE POLICY "inbox_responses_insert_own"
ON public.inbox_responses FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "inbox_responses_update_own" ON public.inbox_responses;
CREATE POLICY "inbox_responses_update_own"
ON public.inbox_responses FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.inbox_responses TO authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'social_notifications'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%kind%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.social_notifications DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;
END $$;

-- Anciens rappels mal placés (on recrée au prochain Attendre)
DELETE FROM public.social_notifications
WHERE kind = 'match_wait_reminder'
  AND (
    body ~* '^En attente par'
    OR body ~* 'a mis ton'
  );

ALTER TABLE public.social_notifications
  DROP CONSTRAINT IF EXISTS social_notifications_kind_check;

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_kind_check
  CHECK (kind IN (
    'flash_received',
    'like_received',
    'match_created',
    'message_received',
    'match_waiting',
    'match_declined',
    'match_wait_reminder'
  ));

CREATE OR REPLACE FUNCTION public.respond_to_inbox_interest(
  p_actor uuid,
  p_decision text,
  p_origin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_name text;
  actor_name text;
  v_decision text := lower(btrim(COALESCE(p_decision, '')));
  v_origin text := lower(btrim(COALESCE(p_origin, '')));
  has_flash boolean := false;
  has_like boolean := false;
  existing_decision text;
  existing_origin text;
  origin_label text;
  de_actor text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_actor IS NULL OR p_actor = me THEN
    RAISE EXCEPTION 'invalid_actor';
  END IF;
  IF v_decision NOT IN ('wait', 'refuse', 'match') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.flashes
    WHERE from_user = p_actor AND to_user = me
  ) INTO has_flash;

  SELECT EXISTS (
    SELECT 1 FROM public.likes
    WHERE from_user = p_actor AND to_user = me
  ) INTO has_like;

  IF NOT has_flash AND NOT has_like THEN
    RAISE EXCEPTION 'no_incoming_interest';
  END IF;

  IF v_origin NOT IN ('flash', 'like') THEN
    v_origin := CASE WHEN has_flash THEN 'flash' ELSE 'like' END;
  ELSIF v_origin = 'flash' AND NOT has_flash AND has_like THEN
    v_origin := 'like';
  ELSIF v_origin = 'like' AND NOT has_like AND has_flash THEN
    v_origin := 'flash';
  END IF;

  SELECT display_name INTO my_name
  FROM public.profiles
  WHERE id = me;
  my_name := COALESCE(NULLIF(btrim(my_name), ''), 'Quelqu’un');

  SELECT ir.decision, ir.origin
  INTO existing_decision, existing_origin
  FROM public.inbox_responses ir
  WHERE ir.user_id = me AND ir.actor_id = p_actor;

  IF existing_decision IS NOT NULL THEN
    IF existing_decision = 'refuse' THEN
      RAISE EXCEPTION 'decision_locked_refuse';
    END IF;
    IF existing_decision = 'match' THEN
      RAISE EXCEPTION 'decision_locked_match';
    END IF;
    -- Après Attendre : Matcher ou Refuser restent possibles
    IF existing_decision = 'wait' AND v_decision = 'wait' THEN
      RAISE EXCEPTION 'decision_locked_wait';
    END IF;
    IF existing_origin IN ('flash', 'like') THEN
      v_origin := existing_origin;
    END IF;
  END IF;

  IF existing_decision IS NOT NULL AND existing_decision = v_decision THEN
    RETURN jsonb_build_object(
      'ok', true,
      'decision', v_decision,
      'origin', COALESCE(NULLIF(v_origin, ''), existing_origin),
      'locked', true
    );
  END IF;

  INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
  VALUES (me, p_actor, v_decision, v_origin)
  ON CONFLICT (user_id, actor_id) DO UPDATE
  SET
    decision = EXCLUDED.decision,
    origin = EXCLUDED.origin,
    updated_at = now()
  WHERE public.inbox_responses.decision IS DISTINCT FROM 'refuse'
    AND public.inbox_responses.decision IS DISTINCT FROM 'match'
    AND (
      public.inbox_responses.decision IS DISTINCT FROM 'wait'
      OR EXCLUDED.decision IN ('match', 'refuse')
    );

  IF v_decision = 'match' THEN
    INSERT INTO public.likes (from_user, to_user)
    VALUES (me, p_actor)
    ON CONFLICT DO NOTHING;

    DELETE FROM public.social_notifications
    WHERE user_id = me
      AND actor_id = p_actor
      AND kind IN ('flash_received', 'like_received', 'match_wait_reminder');

    DELETE FROM public.social_notifications
    WHERE user_id = p_actor
      AND actor_id = me
      AND kind IN ('match_waiting', 'match_wait_reminder')
      AND read_at IS NULL;

    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'match',
      'origin', v_origin
    );
  END IF;

  IF v_decision = 'wait' THEN
    origin_label := CASE WHEN v_origin = 'flash' THEN 'Flash' ELSE 'Like' END;

    SELECT display_name INTO actor_name
    FROM public.profiles
    WHERE id = p_actor;
    actor_name := COALESCE(NULLIF(btrim(actor_name), ''), 'Quelqu’un');
    de_actor := CASE
      WHEN lower(substr(actor_name, 1, 1)) IN (
        'a','e','i','o','u','y','à','â','ä','é','è','ê','ë','ï','î','ô','ù','û','ü','h'
      ) THEN 'd''' || actor_name
      ELSE 'de ' || actor_name
    END;

    -- Retirer le Flash/Like reçu une fois traité
    DELETE FROM public.social_notifications
    WHERE user_id = me
      AND actor_id = p_actor
      AND kind IN ('flash_received', 'like_received', 'match_wait_reminder');

    DELETE FROM public.social_notifications
    WHERE user_id = p_actor
      AND actor_id = me
      AND kind IN ('match_waiting', 'match_wait_reminder')
      AND read_at IS NULL;

    -- Edith (émetteur) : la balle est dans le camp d’Alex
    INSERT INTO public.social_notifications (
      user_id, kind, title, body, actor_id
    ) VALUES (
      p_actor,
      'match_waiting',
      'En attente',
      my_name || ' a mis ton ' || origin_label || ' en attente',
      me
    );

    -- Alex (qui a choisi Attendre) : rappel pour revenir trancher
    INSERT INTO public.social_notifications (
      user_id, kind, title, body, actor_id
    ) VALUES (
      me,
      'match_wait_reminder',
      'À trancher',
      'Pense à valider ou à refuser le ' || origin_label || ' ' || de_actor,
      p_actor
    );

    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'wait',
      'origin', v_origin
    );
  END IF;

  -- refuse
  origin_label := CASE WHEN v_origin = 'flash' THEN 'Flash' ELSE 'Like' END;

  DELETE FROM public.social_notifications
  WHERE user_id = me
    AND actor_id = p_actor
    AND kind IN ('flash_received', 'like_received', 'match_wait_reminder');

  DELETE FROM public.social_notifications
  WHERE user_id = p_actor
    AND actor_id = me
    AND kind IN ('match_declined', 'match_waiting', 'match_wait_reminder')
    AND read_at IS NULL;

  INSERT INTO public.social_notifications (
    user_id, kind, title, body, actor_id
  ) VALUES (
    p_actor,
    'match_declined',
    'Pas cette fois',
    my_name
      || ' a décliné ton ' || origin_label
      || '. Continue tes recherches... Ne te décourage pas !',
    me
  );

  RETURN jsonb_build_object(
    'ok', true,
    'decision', 'refuse',
    'origin', v_origin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_inbox_interest(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_inbox_interest(uuid, text, text) TO authenticated;

-- Rattrapage des anciens libellés confus
UPDATE public.social_notifications sn
SET
  title = 'En attente',
  body = COALESCE(
    (
      SELECT
        COALESCE(NULLIF(btrim(p.display_name), ''), 'Quelqu’un')
        || ' a mis ton '
        || CASE
             WHEN ir.origin = 'flash' OR sn.body ~* 'flash' THEN 'Flash'
             ELSE 'Like'
           END
        || ' en attente'
      FROM public.profiles p
      LEFT JOIN public.inbox_responses ir
        ON ir.user_id = sn.actor_id
       AND ir.actor_id = sn.user_id
      WHERE p.id = sn.actor_id
    ),
    regexp_replace(
      sn.body,
      '^En attente par\s+(.+)$',
      E'\\1 a mis ton intérêt en attente'
    )
  )
WHERE sn.kind = 'match_waiting'
  AND (
    sn.body ~* '^En attente par\s+'
    OR sn.body ~* 'intérêt en attente'
    OR sn.body ~* 'Pense à valider'
  );

NOTIFY pgrst, 'reload schema';
