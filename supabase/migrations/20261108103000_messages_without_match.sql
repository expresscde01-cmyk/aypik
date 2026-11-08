-- Recevoir des messages sans Match : choix du membre (accepts_messages_without_match).
-- Écrire le premier : offre payante active ou Fondateur dans ses 6 mois, 10 personnes / jour (Paris).
-- Répondre à un message déjà reçu sans Match reste possible sans offre payante.
-- Si un Match se forme ensuite, cette réponse reste gratuite pour le destinataire du premier message.
-- Une conversation née d'un Match garde payment_required après l'essai, sans offre payante.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accepts_messages_without_match boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS messages_without_match_notice_seen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.accepts_messages_without_match IS
  'Le membre accepte qu''on lui écrive le premier message sans Match. Désactivé par défaut. Distinct de discover_mode.';

COMMENT ON COLUMN public.profiles.messages_without_match_notice_seen IS
  'L''annonce du menu du compte a été vue. Effacée avec le profil.';

COMMENT ON COLUMN public.profiles.discover_mode IS
  'detaille / simplifie. Densité du parcours Mes Matchs. Ne décide pas de la réception des messages sans Match.';

-- Seuls les comptes déjà en Simplifié avaient choisi d'être joignables.
UPDATE public.profiles
SET accepts_messages_without_match = true
WHERE discover_mode = 'simplifie';

GRANT UPDATE (
  accepts_messages_without_match,
  messages_without_match_notice_seen
) ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.message_openers_daily (
  user_id uuid NOT NULL,
  day date NOT NULL,
  n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

COMMENT ON TABLE public.message_openers_daily IS
  'Premiers messages sans Match envoyés par jour calendaire Europe/Paris. Pas d''accès navigateur.';

ALTER TABLE public.message_openers_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_openers_daily FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_open_messaging_profile(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    (
      SELECT p.accepts_messages_without_match
      FROM public.profiles p
      WHERE p.id = p_user_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_open_messaging_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_open_messaging_profile(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_open_messaging_profile(uuid) IS
  'Vrai si ce membre a choisi d''accepter les messages sans Match.';

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
  matched boolean;
  prior_from_them boolean;
  prior_any boolean;
  v_day date;
  v_n integer;
  first_at timestamptz;
  first_to uuid;
  match_at timestamptz;
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

  matched := public.users_are_matched(me, p_recipient);

  IF matched THEN
    -- Le premier message du fil, s'il est antérieur au Match, garde la
    -- réponse gratuite pour son destinataire. Un fil né du Match non.
    SELECT m.created_at, m.recipient_id
    INTO first_at, first_to
    FROM public.messages m
    WHERE (m.sender_id = me AND m.recipient_id = p_recipient)
       OR (m.sender_id = p_recipient AND m.recipient_id = me)
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT 1;

    SELECT mb.created_at
    INTO match_at
    FROM public.match_bonds mb
    WHERE mb.user_a = least(me, p_recipient)
      AND mb.user_b = greatest(me, p_recipient);

    IF NOT (
      first_at IS NOT NULL
      AND match_at IS NOT NULL
      AND first_at < match_at
      AND first_to = me
    ) THEN
      my_phase := public._account_access_phase(me);
      IF (my_phase ->> 'phase') = 'post_trial'
         AND NOT public.has_paid_messaging(me) THEN
        RAISE EXCEPTION 'payment_required';
      END IF;
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.sender_id = p_recipient
        AND m.recipient_id = me
    )
    INTO prior_from_them;

    SELECT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE (m.sender_id = me AND m.recipient_id = p_recipient)
         OR (m.sender_id = p_recipient AND m.recipient_id = me)
    )
    INTO prior_any;

    IF NOT prior_any THEN
      IF EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = p_recipient
          AND (
            p.paused_at IS NOT NULL
            OR p.deletion_requested_at IS NOT NULL
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.suggestion_refuse_hidden_ids(me) AS h
        WHERE h.hidden_id = p_recipient
      )
      OR EXISTS (
        SELECT 1
        FROM public.discovery_passes dp
        WHERE dp.created_at >= (now() - interval '2 months')
          AND (
            (dp.from_user = me AND dp.to_user = p_recipient)
            OR (dp.from_user = p_recipient AND dp.to_user = me)
          )
      ) THEN
        RAISE EXCEPTION 'member_unavailable';
      END IF;

      IF NOT public.is_open_messaging_profile(p_recipient) THEN
        RAISE EXCEPTION 'recipient_declines_messages_without_match';
      END IF;
    END IF;

    IF NOT prior_from_them THEN
      IF NOT public.has_paid_messaging(me) THEN
        RAISE EXCEPTION 'sender_plan_required';
      END IF;
      IF NOT prior_any THEN
        v_day := (timezone('Europe/Paris', now()))::date;
        INSERT INTO public.message_openers_daily AS d (user_id, day, n)
        VALUES (me, v_day, 1)
        ON CONFLICT (user_id, day) DO UPDATE
          SET n = d.n + 1
          WHERE d.n < 10
        RETURNING n INTO v_n;
        IF v_n IS NULL THEN
          RAISE EXCEPTION 'messages_without_match_daily_limit';
        END IF;
      END IF;
    END IF;
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
  age integer,
  accepts_messages_without_match boolean,
  messages_without_match_notice_seen boolean
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
    public.profile_age(p.birth_date),
    p.accepts_messages_without_match,
    p.messages_without_match_notice_seen
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION public.my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_profile() TO service_role;
REVOKE EXECUTE ON FUNCTION public.my_profile() FROM anon;

COMMENT ON FUNCTION public.my_profile() IS
  'Profil du compte connecté uniquement (auth.uid()). Inclut le choix des messages sans Match et l''annonce déjà vue.';

NOTIFY pgrst, 'reload schema';
