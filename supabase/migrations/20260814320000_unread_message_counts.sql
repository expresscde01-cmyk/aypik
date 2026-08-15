-- Compteur non lus : recipient_id = utilisateur connecté AND read_at IS NULL.

CREATE OR REPLACE FUNCTION public.unread_message_counts()
RETURNS TABLE(sender_id uuid, unread_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.sender_id, COUNT(*)::integer AS unread_count
  FROM public.messages m
  WHERE m.recipient_id = auth.uid()
    AND m.read_at IS NULL
  GROUP BY m.sender_id;
$$;

REVOKE ALL ON FUNCTION public.unread_message_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unread_message_counts() TO authenticated;

DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
CREATE POLICY "messages_select_participants"
ON public.messages FOR SELECT
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "conversations_select_participants" ON public.conversations;
CREATE POLICY "conversations_select_participants"
ON public.conversations FOR SELECT
TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b);

ALTER TABLE public.messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
