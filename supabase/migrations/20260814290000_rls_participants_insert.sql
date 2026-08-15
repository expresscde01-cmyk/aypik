-- Fix 42501 : l’ancienne RLS testait users_are_matched (likes croisés).
-- Un utilisateur authentifié peut écrire dès qu’il est l’un des deux participants.

-- Filet de sécurité : si une ancienne politique appelle encore users_are_matched,
-- elle ne doit plus exiger un like bidirectionnel.
CREATE OR REPLACE FUNCTION public.users_are_matched(u1 uuid, u2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u1 IS DISTINCT FROM u2;
$$;

REVOKE ALL ON FUNCTION public.users_are_matched(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.users_are_matched(uuid, uuid) TO authenticated;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ===== conversations =====
DROP POLICY IF EXISTS "conversations_select_participants" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert_participants" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update_participants" ON public.conversations;

CREATE POLICY "conversations_select_participants"
ON public.conversations FOR SELECT
TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "conversations_insert_participants"
ON public.conversations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "conversations_update_participants"
ON public.conversations FOR UPDATE
TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b)
WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- ===== messages =====
DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_authenticated" ON public.messages;
DROP POLICY IF EXISTS "messages_update_recipient" ON public.messages;

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
  AND (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (
          (c.user_a = sender_id AND c.user_b = recipient_id)
          OR (c.user_a = recipient_id AND c.user_b = sender_id)
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.likes
      WHERE (from_user = sender_id AND to_user = recipient_id)
         OR (from_user = recipient_id AND to_user = sender_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.flashes
      WHERE (from_user = sender_id AND to_user = recipient_id)
         OR (from_user = recipient_id AND to_user = sender_id)
    )
  )
);

CREATE POLICY "messages_update_recipient"
ON public.messages FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;

-- Crée la conversation parente avant l’insert message (évite le 42501 / FK).
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

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  a uuid;
  b uuid;
  conv_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF other_user IS NULL OR other_user = me THEN
    RAISE EXCEPTION 'invalid_participant';
  END IF;

  a := LEAST(me, other_user);
  b := GREATEST(me, other_user);

  SELECT id INTO conv_id
  FROM conversations
  WHERE user_a = a AND user_b = b;

  IF conv_id IS NOT NULL THEN
    RETURN conv_id;
  END IF;

  INSERT INTO conversations (user_a, user_b)
  VALUES (a, b)
  ON CONFLICT (user_a, user_b) DO NOTHING;

  SELECT id INTO conv_id
  FROM conversations
  WHERE user_a = a AND user_b = b;

  RETURN conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
