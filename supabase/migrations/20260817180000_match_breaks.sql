-- Matchs rompus / archivés depuis la conversation.
-- Archiver : masque le match pour soi (lien conservé).
-- Rompre : retire le lien pour les deux, fiche « Matchs rompus ».
-- Rétablir : remet le match dans les conversations actives.
-- Purge : efface définitivement le lien (messages, likes, flashs, bond).

CREATE TABLE IF NOT EXISTS public.match_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  peer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  origin text NOT NULL DEFAULT 'like' CHECK (origin IN ('like', 'flash')),
  action text NOT NULL CHECK (action IN ('archive', 'break')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_breaks_pair_unique UNIQUE (user_id, peer_id),
  CONSTRAINT match_breaks_not_self CHECK (user_id <> peer_id)
);

CREATE INDEX IF NOT EXISTS match_breaks_user_created_idx
  ON public.match_breaks (user_id, created_at DESC);

ALTER TABLE public.match_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_breaks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_breaks_select_own" ON public.match_breaks;
CREATE POLICY "match_breaks_select_own"
ON public.match_breaks FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT ON public.match_breaks TO authenticated;

CREATE TABLE IF NOT EXISTS public.match_bonds (
  user_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  origin text NOT NULL DEFAULT 'like' CHECK (origin IN ('like', 'flash')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CONSTRAINT match_bonds_ordered CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS idx_match_bonds_user_b ON public.match_bonds(user_b);

ALTER TABLE public.match_bonds ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.match_bonds TO authenticated;

DROP POLICY IF EXISTS "match_bonds_select_participants" ON public.match_bonds;
CREATE POLICY "match_bonds_select_participants"
ON public.match_bonds FOR SELECT
TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE OR REPLACE FUNCTION public.ensure_match_bond(u1 uuid, u2 uuid, p_origin text DEFAULT 'like')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a uuid;
  b uuid;
  origin_val text := CASE WHEN p_origin = 'flash' THEN 'flash' ELSE 'like' END;
BEGIN
  IF u1 IS NULL OR u2 IS NULL OR u1 = u2 THEN
    RETURN;
  END IF;
  a := LEAST(u1, u2);
  b := GREATEST(u1, u2);
  INSERT INTO public.match_bonds (user_a, user_b, origin)
  VALUES (a, b, origin_val)
  ON CONFLICT (user_a, user_b) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_match_bond(uuid, uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.pair_has_interest(from_id uuid, to_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    from_id IS DISTINCT FROM to_id
    AND (
      EXISTS (
        SELECT 1 FROM public.likes
        WHERE from_user = from_id AND to_user = to_id
      )
      OR EXISTS (
        SELECT 1 FROM public.flashes
        WHERE from_user = from_id AND to_user = to_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.pair_has_interest(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pair_has_interest(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.match_pair_origin(u1 uuid, u2 uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origin text;
BEGIN
  SELECT mb.origin INTO v_origin
  FROM public.match_bonds mb
  WHERE mb.user_a = LEAST(u1, u2)
    AND mb.user_b = GREATEST(u1, u2);
  IF FOUND AND v_origin IN ('like', 'flash') THEN
    RETURN v_origin;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.flashes
    WHERE (from_user = u1 AND to_user = u2)
       OR (from_user = u2 AND to_user = u1)
  ) THEN
    RETURN 'flash';
  END IF;

  RETURN 'like';
END;
$$;

REVOKE ALL ON FUNCTION public.match_pair_origin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_pair_origin(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.users_are_matched(u1 uuid, u2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u1 IS DISTINCT FROM u2
    AND NOT EXISTS (
      SELECT 1
      FROM public.match_breaks br
      WHERE br.action = 'break'
        AND (
          (br.user_id = u1 AND br.peer_id = u2)
          OR (br.user_id = u2 AND br.peer_id = u1)
        )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.match_bonds mb
        WHERE mb.user_a = LEAST(u1, u2)
          AND mb.user_b = GREATEST(u1, u2)
      )
      OR (
        public.pair_has_interest(u1, u2)
        AND public.pair_has_interest(u2, u1)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.upsert_match_break(
  p_user uuid,
  p_peer uuid,
  p_origin text,
  p_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.match_breaks (user_id, peer_id, origin, action)
  VALUES (p_user, p_peer, p_origin, p_action)
  ON CONFLICT (user_id, peer_id) DO UPDATE
  SET
    origin = EXCLUDED.origin,
    action = EXCLUDED.action,
    created_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_match_break(uuid, uuid, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.manage_active_match(
  p_peer uuid,
  p_break boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  v_origin text;
  v_action text;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_peer IS NULL OR p_peer = me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_peer');
  END IF;
  IF NOT public.users_are_matched(me, p_peer) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_matched');
  END IF;

  v_origin := public.match_pair_origin(me, p_peer);
  v_action := CASE WHEN p_break THEN 'break' ELSE 'archive' END;

  PERFORM public.upsert_match_break(me, p_peer, v_origin, v_action);

  UPDATE public.messages
  SET read_at = COALESCE(read_at, now())
  WHERE recipient_id = me
    AND sender_id = p_peer
    AND read_at IS NULL;

  IF p_break THEN
    PERFORM public.upsert_match_break(p_peer, me, v_origin, 'break');

    DELETE FROM public.match_bonds
    WHERE user_a = LEAST(me, p_peer)
      AND user_b = GREATEST(me, p_peer);

    DELETE FROM public.likes
    WHERE (from_user = me AND to_user = p_peer)
       OR (from_user = p_peer AND to_user = me);

    DELETE FROM public.flashes
    WHERE (from_user = me AND to_user = p_peer)
       OR (from_user = p_peer AND to_user = me);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'action', v_action,
    'origin', v_origin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manage_active_match(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_active_match(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_broken_match(p_peer uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  br public.match_breaks%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_peer IS NULL OR p_peer = me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_peer');
  END IF;

  SELECT * INTO br
  FROM public.match_breaks
  WHERE user_id = me AND peer_id = p_peer;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF br.action = 'break' THEN
    INSERT INTO public.likes (from_user, to_user)
    VALUES (me, p_peer)
    ON CONFLICT (from_user, to_user) DO NOTHING;
    INSERT INTO public.likes (from_user, to_user)
    VALUES (p_peer, me)
    ON CONFLICT (from_user, to_user) DO NOTHING;
    PERFORM public.ensure_match_bond(me, p_peer, br.origin);
    DELETE FROM public.match_breaks
    WHERE (user_id = me AND peer_id = p_peer)
       OR (user_id = p_peer AND peer_id = me);
  ELSE
    DELETE FROM public.match_breaks
    WHERE user_id = me AND peer_id = p_peer;
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', 'restore');
END;
$$;

REVOKE ALL ON FUNCTION public.restore_broken_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_broken_match(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_broken_match(p_peer uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  a uuid;
  b uuid;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_peer IS NULL OR p_peer = me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_peer');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.match_breaks
    WHERE user_id = me AND peer_id = p_peer
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  a := LEAST(me, p_peer);
  b := GREATEST(me, p_peer);

  DELETE FROM public.messages
  WHERE (sender_id = me AND recipient_id = p_peer)
     OR (sender_id = p_peer AND recipient_id = me);

  DELETE FROM public.conversations
  WHERE user_a = a AND user_b = b;

  DELETE FROM public.match_bonds
  WHERE user_a = a AND user_b = b;

  DELETE FROM public.likes
  WHERE (from_user = me AND to_user = p_peer)
     OR (from_user = p_peer AND to_user = me);

  DELETE FROM public.flashes
  WHERE (from_user = me AND to_user = p_peer)
     OR (from_user = p_peer AND to_user = me);

  BEGIN
    DELETE FROM public.inbox_responses
    WHERE (user_id = me AND actor_id = p_peer)
       OR (user_id = p_peer AND actor_id = me);
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;

  DELETE FROM public.social_notifications
  WHERE (user_id = me AND actor_id = p_peer)
     OR (user_id = p_peer AND actor_id = me);

  DELETE FROM public.match_breaks
  WHERE (user_id = me AND peer_id = p_peer)
     OR (user_id = p_peer AND peer_id = me);

  RETURN jsonb_build_object('ok', true, 'action', 'purge');
END;
$$;

REVOKE ALL ON FUNCTION public.purge_broken_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_broken_match(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
