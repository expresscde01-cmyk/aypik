/*
# Private messaging between matched users

## Tables
### conversations
- One row per matched pair (user_a < user_b, unique)
- last_message_at for ordering

### messages
- conversation_id, sender_id, recipient_id, content, created_at, read_at

## Security
- RLS: only participants can read conversations / messages
- Insert messages only as sender, only if mutual match exists
- Realtime enabled on messages
*/

-- ===== helpers =====
CREATE OR REPLACE FUNCTION public.users_are_matched(u1 uuid, u2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM likes l1
    JOIN likes l2
      ON l1.from_user = l2.to_user
     AND l1.to_user = l2.from_user
    WHERE l1.from_user = u1
      AND l1.to_user = u2
  );
$$;

REVOKE ALL ON FUNCTION public.users_are_matched(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.users_are_matched(uuid, uuid) TO authenticated;

-- ===== conversations =====
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_ordered_pair CHECK (user_a < user_b),
  CONSTRAINT conversations_unique_pair UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_a ON conversations(user_a);
CREATE INDEX IF NOT EXISTS idx_conversations_user_b ON conversations(user_b);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_select_participants" ON conversations;
CREATE POLICY "conversations_select_participants"
ON conversations FOR SELECT
TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "conversations_insert_participants" ON conversations;
CREATE POLICY "conversations_insert_participants"
ON conversations FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = user_a OR auth.uid() = user_b)
  AND public.users_are_matched(user_a, user_b)
);

DROP POLICY IF EXISTS "conversations_update_participants" ON conversations;
CREATE POLICY "conversations_update_participants"
ON conversations FOR UPDATE
TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b)
WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- ===== messages =====
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT messages_distinct_users CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread
  ON messages(recipient_id, read_at)
  WHERE read_at IS NULL;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE messages REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "messages_select_participants" ON messages;
CREATE POLICY "messages_select_participants"
ON messages FOR SELECT
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "messages_insert_sender" ON messages;
CREATE POLICY "messages_insert_sender"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND public.users_are_matched(sender_id, recipient_id)
  AND EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_id
      AND (
        (c.user_a = sender_id AND c.user_b = recipient_id)
        OR (c.user_a = recipient_id AND c.user_b = sender_id)
      )
  )
);

DROP POLICY IF EXISTS "messages_update_recipient" ON messages;
CREATE POLICY "messages_update_recipient"
ON messages FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

-- Keep conversation.last_message_at in sync
CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_touch_conversation ON messages;
CREATE TRIGGER messages_touch_conversation
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_on_message();

-- ===== get or create conversation (matched users only) =====
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

  IF NOT public.users_are_matched(me, other_user) THEN
    RAISE EXCEPTION 'not_matched';
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

-- Mark unread messages as read for the current user in a conversation
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = p_conversation_id
      AND (c.user_a = me OR c.user_b = me)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND recipient_id = me
    AND read_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
