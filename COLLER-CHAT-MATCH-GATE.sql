-- Garde Match sur l’envoi de messages (insert_chat_message).
-- Coller TOUT ce fichier dans Supabase → SQL Editor, puis Run.
-- Réutilise public.users_are_matched (match_breaks) : bond, likes/flashes
-- croisés, hors rupture. Pas de nouveau critère.

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
  PERFORM set_config('row_security', 'off', true);
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_recipient IS NULL OR p_recipient = me THEN
    RAISE EXCEPTION 'invalid_participant';
  END IF;
  IF cleaned = '' THEN
    RAISE EXCEPTION 'empty_message';
  END IF;
  IF public.profile_is_deactivated(p_recipient)
    OR public.profile_is_deactivated(me) THEN
    RAISE EXCEPTION 'member_unavailable';
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
GRANT EXECUTE ON FUNCTION public.insert_chat_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_chat_message(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
