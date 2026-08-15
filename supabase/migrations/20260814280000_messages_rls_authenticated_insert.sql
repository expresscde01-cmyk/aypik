-- RLS messages : un utilisateur authentifié peut insérer dans sa conversation.
-- Colonnes : id, conversation_id, sender_id, recipient_id, content, created_at, read_at

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_authenticated" ON public.messages;
DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;

CREATE POLICY "messages_select_participants"
ON public.messages FOR SELECT
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "messages_insert_authenticated"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND sender_id <> recipient_id
);

DROP POLICY IF EXISTS "conversations_insert_participants" ON public.conversations;
CREATE POLICY "conversations_insert_participants"
ON public.conversations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "conversations_select_participants" ON public.conversations;
CREATE POLICY "conversations_select_participants"
ON public.conversations FOR SELECT
TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b);

GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT SELECT, INSERT ON public.conversations TO authenticated;

CREATE OR REPLACE FUNCTION public.messages_ensure_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a uuid;
  b uuid;
  conv_id uuid;
BEGIN
  IF NEW.sender_id IS NULL OR NEW.recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  a := LEAST(NEW.sender_id, NEW.recipient_id);
  b := GREATEST(NEW.sender_id, NEW.recipient_id);

  SELECT id INTO conv_id
  FROM public.conversations
  WHERE user_a = a AND user_b = b;

  IF conv_id IS NULL THEN
    INSERT INTO public.conversations (user_a, user_b)
    VALUES (a, b)
    ON CONFLICT (user_a, user_b) DO NOTHING;

    SELECT id INTO conv_id
    FROM public.conversations
    WHERE user_a = a AND user_b = b;
  END IF;

  IF conv_id IS NOT NULL THEN
    NEW.conversation_id := conv_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_ensure_conversation ON public.messages;
CREATE TRIGGER messages_ensure_conversation
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.messages_ensure_conversation();

NOTIFY pgrst, 'reload schema';
