-- Temps réel messages + notification in-app à l’envoi.

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.social_notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.social_notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'social_notifications'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%kind%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.social_notifications DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;
END $$;

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_kind_check
  CHECK (kind IN (
    'flash_received',
    'like_received',
    'match_created',
    'message_received'
  ));

CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
  existing_id uuid;
BEGIN
  IF NEW.recipient_id IS NULL OR NEW.sender_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO actor_name
  FROM public.profiles
  WHERE id = NEW.sender_id;
  actor_name := COALESCE(NULLIF(btrim(actor_name), ''), 'Quelqu’un');

  SELECT id INTO existing_id
  FROM public.social_notifications
  WHERE user_id = NEW.recipient_id
    AND kind = 'message_received'
    AND actor_id = NEW.sender_id
    AND read_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.social_notifications
    SET
      title = 'Nouveau message',
      body = actor_name || ' t''a envoyé un message',
      created_at = now()
    WHERE id = existing_id;
  ELSE
    INSERT INTO public.social_notifications (
      user_id, kind, title, body, actor_id
    ) VALUES (
      NEW.recipient_id,
      'message_received',
      'Nouveau message',
      actor_name || ' t''a envoyé un message',
      NEW.sender_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_notify_recipient ON public.messages;
CREATE TRIGGER messages_notify_recipient
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_new_message();

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  other_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT CASE WHEN c.user_a = me THEN c.user_b ELSE c.user_a END
  INTO other_id
  FROM public.conversations c
  WHERE c.id = p_conversation_id
    AND (c.user_a = me OR c.user_b = me);

  IF other_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND recipient_id = me
    AND read_at IS NULL;

  UPDATE public.social_notifications
  SET read_at = now()
  WHERE user_id = me
    AND kind = 'message_received'
    AND actor_id = other_id
    AND read_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
