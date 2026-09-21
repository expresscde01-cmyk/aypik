-- Date du dernier message que j’ai envoyé, pour la fenêtre « Relance possible ».
-- Même source que l’INSERT : public.messages.created_at (DEFAULT now()).
-- DROP + CREATE : le type de retour change (ajout de last_sent_at).

DROP FUNCTION IF EXISTS public.peer_dialogue_flags();

CREATE FUNCTION public.peer_dialogue_flags()
RETURNS TABLE (
  peer_id uuid,
  two_way boolean,
  wrote_to_me boolean,
  last_sent_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
    ) AS wrote_to_me,
    (
      SELECT MAX(m.created_at)
      FROM public.messages m
      WHERE m.conversation_id = c.id
        AND m.sender_id = me.uid
    ) AS last_sent_at
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
REVOKE ALL ON FUNCTION public.peer_dialogue_flags() FROM anon;
GRANT EXECUTE ON FUNCTION public.peer_dialogue_flags() TO authenticated;
GRANT EXECUTE ON FUNCTION public.peer_dialogue_flags() TO service_role;

NOTIFY pgrst, 'reload schema';
