CREATE OR REPLACE FUNCTION public.insert_chat_message(
  p_recipient uuid,
  p_content text
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  cleaned text := btrim(COALESCE(p_content, ''));
  a uuid;
  b uuid;
  conv_id uuid;
  row_out public.messages;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_recipient IS NULL OR p_recipient = me THEN
    RAISE EXCEPTION 'invalid_participant';
  END IF;
  IF cleaned = '' THEN
    RAISE EXCEPTION 'empty_message';
  END IF;
  IF NOT public.users_are_matched(me, p_recipient) THEN
    RAISE EXCEPTION 'not_matched';
  END IF;

  a := LEAST(me, p_recipient);
  b := GREATEST(me, p_recipient);
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
  INSERT INTO public.messages (conversation_id, sender_id, recipient_id, content)
  VALUES (conv_id, me, p_recipient, cleaned)
  RETURNING * INTO row_out;
  RETURN row_out;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_chat_message(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_chat_message(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.insert_chat_message(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';