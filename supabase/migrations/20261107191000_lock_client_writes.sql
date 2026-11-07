-- Étape 1 : les écritures sensibles ne passent plus par l'API directe.
-- Les fonctions SECURITY DEFINER de postgres continuent d'écrire
-- (try_claim_founder_slot, insert_chat_message, send_flash,
-- activate_paid_boost, grant_founder_first_month_boost, matchs).

-- La fonction déjà en base renvoie jsonb et duplique quota et notifications.
-- Le site insère aujourd'hui directement : on la remplace par la même insertion,
-- pour que les triggers existants (quota, âge, compte, notification) restent seuls.
DROP FUNCTION IF EXISTS public.send_like(uuid);

CREATE FUNCTION public.send_like(p_to_user uuid)
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
  IF p_to_user IS NULL OR p_to_user = me THEN
    RAISE EXCEPTION 'invalid_participant';
  END IF;
  INSERT INTO public.likes (from_user, to_user)
  VALUES (me, p_to_user);
END;
$$;

REVOKE ALL ON FUNCTION public.send_like(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_like(uuid) TO authenticated;

COMMENT ON FUNCTION public.send_like(uuid) IS
  'Like du compte connecté. Le quota quotidien reste appliqué par likes_enforce_daily_quota.';

CREATE OR REPLACE FUNCTION public.protect_membership_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_founder IS TRUE
       OR NEW.founder_number IS NOT NULL
       OR NEW.plan IS DISTINCT FROM 'free'
       OR NEW.premium_until IS NOT NULL THEN
      RAISE EXCEPTION 'membership_column_forbidden';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_founder IS DISTINCT FROM OLD.is_founder
     OR NEW.founder_number IS DISTINCT FROM OLD.founder_number
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.premium_until IS DISTINCT FROM OLD.premium_until THEN
    RAISE EXCEPTION 'membership_column_forbidden';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memberships_protect_privileged_columns ON public.memberships;
CREATE TRIGGER memberships_protect_privileged_columns
BEFORE INSERT OR UPDATE ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.protect_membership_privileged_columns();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.memberships FROM anon, authenticated;

DROP POLICY IF EXISTS "messages_insert_authenticated" ON public.messages;
DROP POLICY IF EXISTS "conversations_insert_participants" ON public.conversations;
REVOKE INSERT, TRUNCATE ON TABLE public.messages FROM anon, authenticated;
REVOKE INSERT, TRUNCATE ON TABLE public.conversations FROM anon, authenticated;

DROP POLICY IF EXISTS "boosts_insert_own" ON public.profile_boosts;
DROP POLICY IF EXISTS "likes_insert_own" ON public.likes;
DROP POLICY IF EXISTS "flashes_insert_own" ON public.flashes;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.profile_boosts FROM anon, authenticated;
REVOKE INSERT, TRUNCATE ON TABLE public.likes FROM anon, authenticated;
REVOKE INSERT, TRUNCATE ON TABLE public.flashes FROM anon, authenticated;

-- Un message déjà envoyé : le destinataire ne peut changer que la lecture.
REVOKE UPDATE ON TABLE public.messages FROM anon, authenticated;
GRANT UPDATE (read_at) ON TABLE public.messages TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_sent_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'message_column_forbidden';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_protect_sent ON public.messages;
CREATE TRIGGER messages_protect_sent
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.protect_sent_message();

-- Une conversation déjà ouverte : les deux comptes ne bougent plus.
REVOKE UPDATE ON TABLE public.conversations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_conversation_pair()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_a IS DISTINCT FROM OLD.user_a
     OR NEW.user_b IS DISTINCT FROM OLD.user_b THEN
    RAISE EXCEPTION 'conversation_pair_forbidden';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_protect_pair ON public.conversations;
CREATE TRIGGER conversations_protect_pair
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.protect_conversation_pair();

NOTIFY pgrst, 'reload schema';
