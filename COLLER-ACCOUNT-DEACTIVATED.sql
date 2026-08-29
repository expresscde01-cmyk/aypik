-- Coller TOUT ce fichier dans Supabase → SQL Editor, puis Run.
-- Compte en pause (id interne : deactivated). Bloque likes, flashs et messages
-- à la source : rien n’est enregistré. Les interactions antérieures restent.
-- Découvrir / Accueil : coller ensuite COLLER-FIX-SUGGEST-DEACTIVATED.sql
-- (filtre deactivated_at dans suggest_profiles).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

COMMENT ON COLUMN public.profiles.deactivated_at IS
  'Non NULL = compte en pause (deactivated) : aucune nouvelle interaction (like, flash, message).';

CREATE INDEX IF NOT EXISTS profiles_deactivated_at_idx
  ON public.profiles (deactivated_at)
  WHERE deactivated_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.profile_is_deactivated(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_id
      AND deactivated_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.profile_is_deactivated(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_is_deactivated(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_is_deactivated(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reject_if_deactivated_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'messages' THEN
    IF public.profile_is_deactivated(NEW.recipient_id)
      OR public.profile_is_deactivated(NEW.sender_id) THEN
      RAISE EXCEPTION 'member_unavailable';
    END IF;
  ELSE
    IF public.profile_is_deactivated(NEW.to_user)
      OR public.profile_is_deactivated(NEW.from_user) THEN
      RAISE EXCEPTION 'member_unavailable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS likes_reject_if_deactivated ON public.likes;
CREATE TRIGGER likes_reject_if_deactivated
BEFORE INSERT ON public.likes
FOR EACH ROW
EXECUTE FUNCTION public.reject_if_deactivated_interaction();

DROP TRIGGER IF EXISTS flashes_reject_if_deactivated ON public.flashes;
CREATE TRIGGER flashes_reject_if_deactivated
BEFORE INSERT ON public.flashes
FOR EACH ROW
EXECUTE FUNCTION public.reject_if_deactivated_interaction();

DROP TRIGGER IF EXISTS messages_reject_if_deactivated ON public.messages;
CREATE TRIGGER messages_reject_if_deactivated
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.reject_if_deactivated_interaction();

-- Vérifier avant de créer une conversation (rien n’est enregistré).
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

