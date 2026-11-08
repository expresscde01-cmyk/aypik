-- Retour arrière de 20261108103000_messages_without_match.
-- À lancer à la main seulement si cette étape doit être annulée.
-- Ce fichier n'est pas dans supabase/migrations : supabase db push ne l'applique pas.

CREATE OR REPLACE FUNCTION public.is_open_messaging_profile(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  m public.memberships%ROWTYPE;
  v_plan text;
  v_founder_protected boolean;
  v_mode text;
BEGIN
  SELECT * INTO m FROM public.memberships WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  v_plan := COALESCE(m.plan, 'free');
  v_founder_protected :=
    COALESCE(m.is_founder, false)
    AND m.founder_premium_until IS NOT NULL
    AND m.founder_premium_until > now();

  IF v_plan IN ('confort', 'premium') OR v_founder_protected THEN
    SELECT p.discover_mode INTO v_mode
    FROM public.profiles p
    WHERE p.id = p_user_id;
    RETURN COALESCE(v_mode, 'detaille') = 'simplifie';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.is_open_messaging_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_open_messaging_profile(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_open_messaging_profile(uuid) IS
  'Destinataire joignable sans Match : Gratuit/Basique/Essentiel, ou profil protégé (Confort/Premium/Fondateur en fenêtre) ayant choisi discover_mode = simplifie. Aucun passe-droit pour écrire aux autres profils protégés.';

COMMENT ON COLUMN public.profiles.discover_mode IS
  'detaille / simplifie. Mes Matchs : densité du parcours. Messagerie : si le compte est protégé (Confort, Premium, Fondateur en fenêtre), simplifie le rend joignable sans Match en réception uniquement.';

CREATE OR REPLACE FUNCTION public.insert_chat_message(p_recipient uuid, p_content text)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := auth.uid();
  cleaned text := btrim(coalesce(p_content, ''));
  a uuid;
  b uuid;
  conv_id uuid;
  row_out public.messages;
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
  IF (my_phase ->> 'phase') = 'post_trial'
     AND NOT public.has_paid_messaging(me) THEN
    RAISE EXCEPTION 'payment_required';
  END IF;

  IF NOT public.users_are_matched(me, p_recipient)
     AND NOT public.is_open_messaging_profile(p_recipient) THEN
    RAISE EXCEPTION 'not_matched';
  END IF;

  a := least(me, p_recipient);
  b := greatest(me, p_recipient);

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

DROP FUNCTION IF EXISTS public.my_profile();

CREATE FUNCTION public.my_profile()
RETURNS TABLE (
  id uuid,
  display_name text,
  birth_date date,
  bio text,
  has_children boolean,
  location text,
  interests text[],
  photo_url text,
  gender text,
  lat double precision,
  lng double precision,
  deletion_requested_at timestamptz,
  country_code text,
  city_name text,
  geoname_id bigint,
  discover_mode text,
  email_notifications_enabled boolean,
  preferred_locale text,
  temperament text[],
  languages jsonb,
  greeting_name_color text,
  paused_at timestamptz,
  deactivated_at timestamptz,
  incognito_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  age integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.display_name,
    p.birth_date,
    p.bio,
    p.has_children,
    p.location,
    p.interests,
    p.photo_url,
    p.gender,
    p.lat,
    p.lng,
    p.deletion_requested_at,
    p.country_code,
    p.city_name,
    p.geoname_id,
    p.discover_mode,
    p.email_notifications_enabled,
    p.preferred_locale,
    p.temperament,
    p.languages,
    p.greeting_name_color,
    p.paused_at,
    p.deactivated_at,
    p.incognito_at,
    p.created_at,
    p.updated_at,
    public.profile_age(p.birth_date)
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION public.my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_profile() TO service_role;
REVOKE EXECUTE ON FUNCTION public.my_profile() FROM anon;

COMMENT ON FUNCTION public.my_profile() IS
  'Profil du compte connecté uniquement (auth.uid()). Colonnes privées : birth_date, lat/lng, flags compte, e-mail, locale, couleur du prénom.';

DROP TABLE IF EXISTS public.message_openers_daily;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS accepts_messages_without_match;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS messages_without_match_notice_seen;

NOTIFY pgrst, 'reload schema';
