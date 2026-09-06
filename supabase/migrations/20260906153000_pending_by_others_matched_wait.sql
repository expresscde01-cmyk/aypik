-- Élargit get_pending_by_others : wait en cours + match ayant wait_started_at.
-- Le client filtre toujours « Mis en attente par l’autre » sur decision = 'wait'.

CREATE INDEX IF NOT EXISTS inbox_responses_actor_wait_idx
  ON public.inbox_responses (actor_id, created_at DESC)
  WHERE decision = 'wait';

DROP FUNCTION IF EXISTS public.get_pending_by_others();

CREATE FUNCTION public.get_pending_by_others()
RETURNS TABLE (
  peer_id uuid,
  origin text,
  created_at timestamptz,
  wait_started_at timestamptz,
  decision text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    ir.user_id AS peer_id,
    ir.origin,
    ir.created_at,
    ir.wait_started_at,
    ir.decision::text
  FROM public.inbox_responses ir
  WHERE ir.actor_id = me
    AND (
      ir.decision = 'wait'
      OR (ir.decision = 'match' AND ir.wait_started_at IS NOT NULL)
    )
  ORDER BY ir.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_by_others() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_by_others() TO authenticated;

NOTIFY pgrst, 'reload schema';
