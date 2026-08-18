-- Coller dans l’éditeur SQL Supabase.
-- Rétablir un Like/Flash après Attendre → retour « à étudier ».

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_responses TO authenticated;

DROP POLICY IF EXISTS "inbox_responses_delete_own" ON public.inbox_responses;
CREATE POLICY "inbox_responses_delete_own"
ON public.inbox_responses FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND decision IN ('wait', 'refuse'));

CREATE OR REPLACE FUNCTION public.reset_inbox_interest(p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  existing_decision text;
  existing_origin text;
  actor_name text;
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

  IF existing_decision IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'decision', 'reset', 'already', true);
  END IF;

  IF existing_decision = 'match' THEN
    RAISE EXCEPTION 'decision_locked_match';
  END IF;

  IF existing_decision IS DISTINCT FROM 'wait' THEN
    RETURN jsonb_build_object('ok', true, 'decision', 'reset', 'already', true);
  END IF;

  DELETE FROM public.inbox_responses
  WHERE user_id = me
    AND actor_id = p_actor
    AND decision = 'wait';

  DELETE FROM public.social_notifications
  WHERE user_id = me
    AND actor_id = p_actor
    AND kind = 'match_wait_reminder';

  DELETE FROM public.social_notifications
  WHERE user_id = p_actor
    AND actor_id = me
    AND kind IN ('match_waiting', 'match_wait_reminder')
    AND read_at IS NULL;

  IF existing_origin IN ('flash', 'like') THEN
    SELECT display_name INTO actor_name
    FROM public.profiles
    WHERE id = p_actor;
    actor_name := COALESCE(NULLIF(btrim(actor_name), ''), 'Quelqu’un');

    IF NOT EXISTS (
      SELECT 1
      FROM public.social_notifications
      WHERE user_id = me
        AND actor_id = p_actor
        AND kind IN ('flash_received', 'like_received')
    ) THEN
      INSERT INTO public.social_notifications (
        user_id, kind, title, body, actor_id
      ) VALUES (
        me,
        CASE WHEN existing_origin = 'flash' THEN 'flash_received' ELSE 'like_received' END,
        CASE WHEN existing_origin = 'flash' THEN 'Nouveau Flash' ELSE 'Nouveau like' END,
        actor_name || CASE
          WHEN existing_origin = 'flash' THEN ' t''a envoyé un flash'
          ELSE ' t''a envoyé un like'
        END,
        p_actor
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'decision', 'reset', 'origin', existing_origin);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_inbox_interest(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_inbox_interest(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
