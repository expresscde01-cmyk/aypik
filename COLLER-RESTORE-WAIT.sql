-- Coller dans l’éditeur SQL Supabase, puis Run.
-- Déverrouille refuse → wait pour les allers-retours archive / maillon.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_responses TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_inbox_wait(
  p_actor uuid,
  p_origin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  v_origin text := lower(btrim(COALESCE(p_origin, '')));
  existing_decision text;
  existing_origin text;
  has_flash boolean := false;
  has_like boolean := false;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_actor IS NULL OR p_actor = me THEN
    RAISE EXCEPTION 'invalid_actor';
  END IF;

  SELECT ir.decision, ir.origin
  INTO existing_decision, existing_origin
  FROM public.inbox_responses ir
  WHERE ir.user_id = me AND ir.actor_id = p_actor;

  IF existing_decision = 'match' THEN
    RAISE EXCEPTION 'decision_locked_match';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.flashes
    WHERE from_user = p_actor AND to_user = me
  ) INTO has_flash;

  SELECT EXISTS (
    SELECT 1 FROM public.likes
    WHERE from_user = p_actor AND to_user = me
  ) INTO has_like;

  IF existing_origin IN ('flash', 'like') THEN
    v_origin := existing_origin;
  ELSIF v_origin NOT IN ('flash', 'like') THEN
    v_origin := CASE WHEN has_flash THEN 'flash' ELSE 'like' END;
  END IF;

  INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
  VALUES (me, p_actor, 'wait', v_origin)
  ON CONFLICT (user_id, actor_id) DO UPDATE
  SET
    decision = 'wait',
    origin = EXCLUDED.origin,
    updated_at = now()
  WHERE public.inbox_responses.decision IS DISTINCT FROM 'match';

  RETURN jsonb_build_object(
    'ok', true,
    'decision', 'wait',
    'origin', v_origin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_inbox_wait(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_inbox_wait(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
