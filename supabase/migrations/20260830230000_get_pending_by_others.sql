-- RPC : likes/flashs que l’autre a mis en attente (actor_id = moi, decision = wait).
-- Ne touche pas aux politiques RLS de inbox_responses.

CREATE INDEX IF NOT EXISTS inbox_responses_actor_wait_idx
  ON public.inbox_responses (actor_id, created_at DESC)
  WHERE decision = 'wait';

CREATE OR REPLACE FUNCTION public.get_pending_by_others()
RETURNS TABLE (
  peer_id uuid,
  origin text,
  created_at timestamptz
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
    ir.created_at
  FROM public.inbox_responses ir
  WHERE ir.actor_id = me
    AND ir.decision = 'wait'
  ORDER BY ir.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_by_others() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_by_others() TO authenticated;

NOTIFY pgrst, 'reload schema';
