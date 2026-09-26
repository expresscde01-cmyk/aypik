-- Un compte avec beaucoup de conversations faisait échouer peer_dialogue_flags :
-- 1. La fonction renvoyait une ligne par pair. PostgREST refuse au-delà de
--    1000 lignes (db-max-rows, PGRST116). Le verrou « 1er mot » restait fermé.
-- 2. Cinq sous-requêtes par conversation pouvaient dépasser statement_timeout.
-- Les profils supprimés ne sont pas en cause : user_a / user_b et les messages
-- partent en CASCADE. Les politiques RLS ne lèvent pas d'erreur (simple égalité
-- sur auth.uid()) et cette fonction est SECURITY DEFINER.
-- Un seul parcours, un seul jsonb : le client reçoit le même tableau qu'avant.

DROP FUNCTION IF EXISTS public.peer_dialogue_flags();

CREATE FUNCTION public.peer_dialogue_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'peer_id', s.peer_id,
        'two_way', s.two_way,
        'wrote_to_me', s.wrote_to_me,
        'last_sent_at', s.last_sent_at
      )
      ORDER BY s.peer_id
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      CASE
        WHEN c.user_a = me.uid THEN c.user_b
        ELSE c.user_a
      END AS peer_id,
      (
        bool_or(m.sender_id = me.uid)
        AND bool_or(
          m.sender_id = CASE
            WHEN c.user_a = me.uid THEN c.user_b
            ELSE c.user_a
          END
        )
      ) AS two_way,
      bool_or(m.recipient_id = me.uid) AS wrote_to_me,
      max(m.created_at) FILTER (WHERE m.sender_id = me.uid) AS last_sent_at
    FROM public.conversations c
    JOIN public.messages m ON m.conversation_id = c.id
    CROSS JOIN (SELECT (SELECT auth.uid()) AS uid) me
    WHERE me.uid IS NOT NULL
      AND (c.user_a = me.uid OR c.user_b = me.uid)
    GROUP BY c.id
  ) s;
$$;

REVOKE ALL ON FUNCTION public.peer_dialogue_flags() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.peer_dialogue_flags() FROM anon;
GRANT EXECUTE ON FUNCTION public.peer_dialogue_flags() TO authenticated;
GRANT EXECUTE ON FUNCTION public.peer_dialogue_flags() TO service_role;

CREATE INDEX IF NOT EXISTS messages_conversation_sender_idx
  ON public.messages (conversation_id, sender_id);

NOTIFY pgrst, 'reload schema';
