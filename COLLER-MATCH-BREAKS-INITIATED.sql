-- Matchs rompus : auteur de la rupture (initiated_by).
-- À coller dans l’éditeur SQL Supabase si COLLER-MATCH-BREAKS.sql a déjà été exécuté
-- sans cette colonne. Sinon, recoller COLLER-MATCH-BREAKS.sql (version à jour) suffit.
--
-- « Matchs rompus par toi » : archive, ou rupture dont tu es l’auteur (rétablir + supprimer).
-- « Matchs rompus par l’autre » : rupture initiée par l’interlocuteur (supprimer uniquement).
-- Les anciennes ruptures n’ont pas d’auteur connu : initiated_by = user_id (chacun voit « par toi »).

ALTER TABLE public.match_breaks
  ADD COLUMN IF NOT EXISTS initiated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.match_breaks
SET initiated_by = user_id
WHERE initiated_by IS NULL;

DROP FUNCTION IF EXISTS public.upsert_match_break(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.upsert_match_break(
  p_user uuid,
  p_peer uuid,
  p_origin text,
  p_action text,
  p_initiated_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.match_breaks (user_id, peer_id, origin, action, initiated_by)
  VALUES (p_user, p_peer, p_origin, p_action, p_initiated_by)
  ON CONFLICT (user_id, peer_id) DO UPDATE
  SET
    origin = EXCLUDED.origin,
    action = EXCLUDED.action,
    initiated_by = EXCLUDED.initiated_by,
    created_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_match_break(uuid, uuid, text, text, uuid) FROM PUBLIC;

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

  PERFORM public.upsert_match_break(me, p_peer, v_origin, v_action, me);

  UPDATE public.messages
  SET read_at = COALESCE(read_at, now())
  WHERE recipient_id = me
    AND sender_id = p_peer
    AND read_at IS NULL;

  IF p_break THEN
    PERFORM public.upsert_match_break(p_peer, me, v_origin, 'break', me);

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

  IF br.action = 'break'
     AND br.initiated_by IS NOT NULL
     AND br.initiated_by IS DISTINCT FROM me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_initiator');
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

NOTIFY pgrst, 'reload schema';
