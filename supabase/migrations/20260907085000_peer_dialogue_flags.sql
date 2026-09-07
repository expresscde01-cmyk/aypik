-- Flags de dialogue par pair (échange réel / l’autre m’a écrit).
-- Remplace les scans client de jusqu’à 2000 lignes public.messages.
-- SECURITY DEFINER : filtre strictement les conversations du compte connecté.

CREATE OR REPLACE FUNCTION public.peer_dialogue_flags()
RETURNS TABLE (
  peer_id uuid,
  two_way boolean,
  wrote_to_me boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN c.user_a = me.uid THEN c.user_b
      ELSE c.user_a
    END AS peer_id,
    (
      EXISTS (
        SELECT 1
        FROM public.messages m
        WHERE m.conversation_id = c.id
          AND m.sender_id = me.uid
      )
      AND EXISTS (
        SELECT 1
        FROM public.messages m
        WHERE m.conversation_id = c.id
          AND m.sender_id = CASE
            WHEN c.user_a = me.uid THEN c.user_b
            ELSE c.user_a
          END
      )
    ) AS two_way,
    EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.conversation_id = c.id
        AND m.recipient_id = me.uid
    ) AS wrote_to_me
  FROM public.conversations c
  CROSS JOIN (SELECT (select auth.uid()) AS uid) me
  WHERE me.uid IS NOT NULL
    AND (c.user_a = me.uid OR c.user_b = me.uid)
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.conversation_id = c.id
    );
$$;

REVOKE ALL ON FUNCTION public.peer_dialogue_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peer_dialogue_flags() TO authenticated;

NOTIFY pgrst, 'reload schema';
