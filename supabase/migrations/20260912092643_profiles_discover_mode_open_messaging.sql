-- Mode d'affichage Découvrir/Mes Matchs (simplifié/détaillé) + messagerie ouverte.
-- Choisir le mode "simplifié" vaut consentement explicite à recevoir des messages
-- sans avoir liké/flashé en retour (bouton "Dialogue" direct depuis Découvrir).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discover_mode text NOT NULL DEFAULT 'detaille';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_discover_mode_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_discover_mode_check
  CHECK (discover_mode IN ('detaille', 'simplifie'));

COMMENT ON COLUMN public.profiles.discover_mode IS
  'Préférence utilisateur : "detaille" (parcours complet Avant/Pendant/Après) ou '
  '"simplifie" (Découvrir + Mes Matchs épurés, dialogue direct sans match requis). '
  'Modifiable librement par le titulaire du profil.';

GRANT SELECT (discover_mode), UPDATE (discover_mode)
  ON public.profiles TO authenticated;

-- L'envoi de message est désormais aussi autorisé quand le DESTINATAIRE
-- est en mode simplifié (il a consenti à recevoir sans match).
CREATE OR REPLACE FUNCTION public.insert_chat_message(p_recipient uuid, p_content text)
 RETURNS messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  cleaned text := btrim(COALESCE(p_content, ''));
  a uuid;
  b uuid;
  conv_id uuid;
  row_out public.messages;
  recipient_open_messaging boolean;
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

  SELECT (discover_mode = 'simplifie') INTO recipient_open_messaging
  FROM public.profiles
  WHERE id = p_recipient;

  IF NOT public.users_are_matched(me, p_recipient)
     AND NOT COALESCE(recipient_open_messaging, false) THEN
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
$function$;

NOTIFY pgrst, 'reload schema';
