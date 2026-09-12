-- Socle backend de la bascule automatique post-lancement (23/11/2026).
-- Calcul de la "phase" d'accès de chaque compte à partir de sa propre date
-- d'inscription (memberships.created_at) — pas de tâche planifiée (cron)
-- nécessaire : la bascule est purement un calcul de date à la volée, donc
-- immédiate et sans coupure pour chaque compte, dès l'instant où il franchit
-- son propre seuil.
--
-- Phases :
--   founder_full     : Fondateur (1..500), dans sa fenêtre de 6 mois.
--   trial_full       : non-Fondateur, dans son 1er mois.
--   trial_simplified : non-Fondateur, du mois 2 au mois 6 (mode Simplifié
--                       gratuit uniquement — déjà géré par insert_chat_message
--                       via discover_mode='simplifie', aucun changement requis
--                       à cet endroit).
--   post_trial       : au-delà de la fenêtre (6 mois pour un Fondateur, 6 mois
--                       pour un non-Fondateur également — 1 mois illimité +
--                       5 mois simplifié gratuit). Sans plan payant actif :
--                       consultation/like/flash toujours possibles, mais
--                       aucun nouvel envoi de message (insert_chat_message
--                       bloque, cf. plus bas). payment_visible passe à true :
--                       c'est le seul moment où les CGV et les moyens de
--                       paiement doivent devenir accessibles pour ce compte.
--
-- IMPORTANT : payments_enabled reste à 0 et SITE_FREE_MODE reste actif côté
-- frontend tant que le paiement réel n'est pas branché — cette migration ne
-- rend donc rien payant tout de suite. Elle pose uniquement le calcul de
-- phase et le blocage d'envoi de message en post_trial sans plan payant, ce
-- qui ne peut concerner aucun compte réel avant mi-2027 (6 mois après le
-- tout premier inscrit du 23/11/2026).

CREATE OR REPLACE FUNCTION public._account_access_phase(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  m memberships%ROWTYPE;
  v_full_until timestamptz;
  v_simplified_until timestamptz;
  v_phase text;
BEGIN
  SELECT * INTO m FROM memberships WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    -- Pas encore de ligne memberships (cas transitoire à l'inscription) :
    -- on considère l'accès comme non encore ouvert, sans paiement visible.
    RETURN jsonb_build_object(
      'phase', 'trial_full',
      'full_access_until', null,
      'simplified_free_until', null,
      'payment_visible', false
    );
  END IF;

  IF COALESCE(m.is_founder, false) THEN
    v_full_until := COALESCE(m.founder_premium_until, m.created_at + interval '6 months');
    v_simplified_until := v_full_until;
  ELSE
    v_full_until := m.created_at + interval '1 month';
    v_simplified_until := m.created_at + interval '6 months';
  END IF;

  IF now() < v_full_until THEN
    v_phase := CASE WHEN COALESCE(m.is_founder, false) THEN 'founder_full' ELSE 'trial_full' END;
  ELSIF now() < v_simplified_until THEN
    v_phase := 'trial_simplified';
  ELSE
    v_phase := 'post_trial';
  END IF;

  RETURN jsonb_build_object(
    'phase', v_phase,
    'full_access_until', v_full_until,
    'simplified_free_until', v_simplified_until,
    'payment_visible', now() >= v_simplified_until
  );
END;
$$;

REVOKE ALL ON FUNCTION public._account_access_phase(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._account_access_phase(uuid) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.get_account_access_phase(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN public._account_access_phase(p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_access_phase(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_account_access_phase(uuid) FROM anon, public;

-- Bloque l'envoi de nouveaux messages en phase post_trial sans plan payant
-- actif. Ne change rien pour les phases founder_full / trial_full /
-- trial_simplified, ni pour un compte post_trial ayant un plan payant actif
-- (has_active_premium).
CREATE OR REPLACE FUNCTION public.insert_chat_message(p_recipient uuid, p_content text)
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
  recipient_open_messaging boolean;
  my_phase jsonb;
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

  my_phase := public._account_access_phase(me);
  IF (my_phase ->> 'phase') = 'post_trial' AND NOT public.has_active_premium(me) THEN
    RAISE EXCEPTION 'payment_required';
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
$$;
