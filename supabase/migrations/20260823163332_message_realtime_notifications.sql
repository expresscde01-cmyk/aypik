-- Temps reel messages + notification in-app a envoi.
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
  actor_name := COALESCE(NULLIF(btrim(actor_name), ''), 'Quelqu''un');
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
      body = actor_name || ' t''a envoye un message',
      created_at = now()
    WHERE id = existing_id;
  ELSE
    INSERT INTO public.social_notifications (
      user_id, kind, title, body, actor_id
    ) VALUES (
      NEW.recipient_id,
      'message_received',
      'Nouveau message',
      actor_name || ' t''a envoye un message',
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
NOTIFY pgrst, 'reload schema';
