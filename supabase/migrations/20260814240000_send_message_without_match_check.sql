-- Envoi de message sans contrôle users_are_matched / not_matched.
-- Un utilisateur authentifié peut écrire dès qu’il est l’un des deux
-- participants (like, flash accepté ou conversation déjà ouverte).

DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
CREATE POLICY "messages_insert_sender"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND sender_id <> recipient_id
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND (
        (c.user_a = sender_id AND c.user_b = recipient_id)
        OR (c.user_a = recipient_id AND c.user_b = sender_id)
      )
  )
);

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

CREATE OR REPLACE FUNCTION public.send_conversation_message(
  p_recipient_id uuid,
  p_content text,
  p_conversation_id uuid DEFAULT NULL
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  cleaned text := btrim(COALESCE(p_content, ''));
  conv_id uuid;
  a uuid;
  b uuid;
  row_out public.messages;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_recipient_id IS NULL OR p_recipient_id = me THEN
    RAISE EXCEPTION 'invalid_participant';
  END IF;

  IF cleaned = '' THEN
    RAISE EXCEPTION 'empty_message';
  END IF;

  a := LEAST(me, p_recipient_id);
  b := GREATEST(me, p_recipient_id);

  IF p_conversation_id IS NOT NULL THEN
    SELECT c.id INTO conv_id
    FROM conversations c
    WHERE c.id = p_conversation_id
      AND (
        (c.user_a = me AND c.user_b = p_recipient_id)
        OR (c.user_a = p_recipient_id AND c.user_b = me)
      );
  END IF;

  IF conv_id IS NULL THEN
    SELECT c.id INTO conv_id
    FROM conversations c
    WHERE c.user_a = a AND c.user_b = b;
  END IF;

  IF conv_id IS NULL THEN
    INSERT INTO conversations (user_a, user_b)
    VALUES (a, b)
    ON CONFLICT (user_a, user_b) DO NOTHING;

    SELECT c.id INTO conv_id
    FROM conversations c
    WHERE c.user_a = a AND c.user_b = b;
  END IF;

  INSERT INTO messages (conversation_id, sender_id, recipient_id, content)
  VALUES (conv_id, me, p_recipient_id, cleaned)
  RETURNING * INTO row_out;

  RETURN row_out;
END;
$$;

REVOKE ALL ON FUNCTION public.send_conversation_message(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_conversation_message(uuid, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
