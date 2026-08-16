-- Témoignages membres payants (Premium) + preuve de consentement RGPD.
-- Hors période Fondateur gratuite. Le mode lancement (SITE_FREE_MODE) masque l’UI ;
-- le backend n’accepte que plan = premium avec période encore active.

-- ===== Preuve de consentement rattachée au profil =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS testimonial_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS testimonial_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS testimonial_consent_withdrawn_at timestamptz;

COMMENT ON COLUMN public.profiles.testimonial_consent IS
  'Preuve RGPD : l’utilisateur a autorisé la diffusion de son témoignage et de son prénom. Jamais pré-coché côté client.';
COMMENT ON COLUMN public.profiles.testimonial_consent_at IS
  'Horodatage précis de la validation du consentement témoignage (UTC).';
COMMENT ON COLUMN public.profiles.testimonial_consent_withdrawn_at IS
  'Horodatage du retrait du consentement, le cas échéant.';

-- ===== Métadonnées Premium payant (relance e-mail) =====
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS paid_premium_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS testimonial_invite_sent_at timestamptz;

COMMENT ON COLUMN public.memberships.paid_premium_started_at IS
  'Premier passage à l’abonnement Premium payant. Non réécrit lors des renouvellements.';
COMMENT ON COLUMN public.memberships.testimonial_invite_sent_at IS
  'E-mail d’invitation à témoigner déjà envoyé (relance J+14).';

CREATE INDEX IF NOT EXISTS memberships_testimonial_invite_idx
  ON public.memberships (paid_premium_started_at)
  WHERE testimonial_invite_sent_at IS NULL
    AND paid_premium_started_at IS NOT NULL
    AND plan = 'premium';

INSERT INTO public.platform_settings (key, value)
VALUES ('testimonial_invite_delay_days', '14'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ===== Table témoignages =====
CREATE TABLE IF NOT EXISTS public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  body text NOT NULL,
  avatar_url text,
  consent_given boolean NOT NULL,
  consent_given_at timestamptz NOT NULL,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT testimonials_consent_true CHECK (consent_given = true),
  CONSTRAINT testimonials_body_len CHECK (
    char_length(btrim(body)) BETWEEN 40 AND 800
  ),
  CONSTRAINT testimonials_first_name_len CHECK (
    char_length(btrim(first_name)) BETWEEN 1 AND 40
  )
);

CREATE INDEX IF NOT EXISTS testimonials_published_idx
  ON public.testimonials (created_at DESC)
  WHERE is_published = true AND consent_given = true;

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "testimonials_select_own" ON public.testimonials;
CREATE POLICY "testimonials_select_own"
ON public.testimonials FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

REVOKE ALL ON public.testimonials FROM PUBLIC;
REVOKE ALL ON public.testimonials FROM anon;
GRANT SELECT ON public.testimonials TO authenticated;
GRANT ALL ON public.testimonials TO service_role;

DROP TRIGGER IF EXISTS testimonials_updated_at ON public.testimonials;
CREATE TRIGGER testimonials_updated_at
BEFORE UPDATE ON public.testimonials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ===== Protection des colonnes RGPD / meta (hors RPC SECURITY DEFINER) =====
CREATE OR REPLACE FUNCTION public.protect_testimonial_consent_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('aypik.allow_testimonial_consent', true) IS DISTINCT FROM '1' THEN
      NEW.testimonial_consent := false;
      NEW.testimonial_consent_at := NULL;
      NEW.testimonial_consent_withdrawn_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF current_setting('aypik.allow_testimonial_consent', true) IS DISTINCT FROM '1' THEN
    NEW.testimonial_consent := OLD.testimonial_consent;
    NEW.testimonial_consent_at := OLD.testimonial_consent_at;
    NEW.testimonial_consent_withdrawn_at := OLD.testimonial_consent_withdrawn_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_testimonial_consent ON public.profiles;
CREATE TRIGGER profiles_protect_testimonial_consent
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_testimonial_consent_columns();

CREATE OR REPLACE FUNCTION public.protect_paid_premium_meta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('aypik.allow_paid_meta', true) IS DISTINCT FROM '1' THEN
      NEW.paid_premium_started_at := NULL;
      NEW.testimonial_invite_sent_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF current_setting('aypik.allow_paid_meta', true) IS DISTINCT FROM '1' THEN
    NEW.paid_premium_started_at := OLD.paid_premium_started_at;
    NEW.testimonial_invite_sent_at := OLD.testimonial_invite_sent_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memberships_protect_paid_meta ON public.memberships;
CREATE TRIGGER memberships_protect_paid_meta
BEFORE INSERT OR UPDATE ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.protect_paid_premium_meta();

-- ===== Premium payant actif (hors offre Fondateur gratuite) =====
CREATE OR REPLACE FUNCTION public.has_active_paid_premium(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = p_user_id
      AND m.plan = 'premium'
      AND (m.premium_until IS NULL OR m.premium_until > now())
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_paid_premium(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_paid_premium(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_paid_premium(uuid) TO service_role;

-- Premier passage payant : horodatage figé
CREATE OR REPLACE FUNCTION public.activate_paid_premium(
  p_user_id uuid,
  p_provider text,
  p_period_end timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('aypik.allow_paid_meta', '1', true);

  INSERT INTO public.memberships (
    user_id,
    plan,
    premium_until,
    payment_provider,
    paid_premium_started_at
  )
  VALUES (
    p_user_id,
    'premium',
    COALESCE(p_period_end, now() + interval '1 month'),
    p_provider,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan = 'premium',
    premium_until = COALESCE(p_period_end, now() + interval '1 month'),
    payment_provider = p_provider,
    paid_premium_started_at = COALESCE(
      public.memberships.paid_premium_started_at,
      now()
    ),
    updated_at = now();

  INSERT INTO public.membership_notifications (user_id, kind, title, body)
  VALUES (
    p_user_id,
    'premium_activated',
    'Premium activé',
    'Merci pour votre soutien. Votre abonnement Premium est actif. Vous pouvez le résilier à tout moment en un clic depuis votre profil.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_paid_premium(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_paid_premium(uuid, text, timestamptz) TO service_role;

-- ===== Soumission (membres payants uniquement, consentement explicite) =====
CREATE OR REPLACE FUNCTION public.submit_paid_testimonial(
  p_body text,
  p_consent boolean,
  p_include_avatar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  p public.profiles%ROWTYPE;
  cleaned text;
  fname text;
  age_years integer;
  sub text;
  avatar text;
  consented_at timestamptz := now();
  row_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.has_active_paid_premium(uid) THEN
    RAISE EXCEPTION 'not_paid_premium';
  END IF;

  IF p_consent IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'consent_required';
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF p.deletion_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'account_deletion_pending';
  END IF;

  cleaned := btrim(COALESCE(p_body, ''));
  IF char_length(cleaned) < 40 THEN
    RAISE EXCEPTION 'testimonial_too_short';
  END IF;
  IF char_length(cleaned) > 800 THEN
    RAISE EXCEPTION 'testimonial_too_long';
  END IF;

  fname := btrim(split_part(COALESCE(p.display_name, ''), ' ', 1));
  IF fname = '' THEN
    fname := 'Membre';
  END IF;
  fname := left(fname, 40);

  age_years := EXTRACT(YEAR FROM age(current_date, p.birth_date))::integer;
  IF age_years IS NOT NULL AND age_years >= 18 THEN
    sub := age_years::text || ' ans';
  ELSE
    sub := left(COALESCE(NULLIF(btrim(p.display_name), ''), 'Membre Premium'), 40);
  END IF;

  avatar := NULL;
  IF p_include_avatar AND COALESCE(NULLIF(btrim(p.photo_url), ''), '') <> '' THEN
    avatar := p.photo_url;
  END IF;

  PERFORM set_config('aypik.allow_testimonial_consent', '1', true);

  UPDATE public.profiles
  SET
    testimonial_consent = true,
    testimonial_consent_at = consented_at,
    testimonial_consent_withdrawn_at = NULL
  WHERE id = uid;

  INSERT INTO public.testimonials (
    user_id,
    first_name,
    subtitle,
    body,
    avatar_url,
    consent_given,
    consent_given_at,
    is_published
  )
  VALUES (
    uid,
    fname,
    sub,
    cleaned,
    avatar,
    true,
    consented_at,
    true
  )
  ON CONFLICT (user_id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    subtitle = EXCLUDED.subtitle,
    body = EXCLUDED.body,
    avatar_url = EXCLUDED.avatar_url,
    consent_given = true,
    consent_given_at = EXCLUDED.consent_given_at,
    is_published = true,
    updated_at = now()
  RETURNING id INTO row_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', row_id,
    'consent_given', true,
    'consent_given_at', consented_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_paid_testimonial(text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_paid_testimonial(text, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_my_testimonial()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  withdrawn_at timestamptz := now();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM set_config('aypik.allow_testimonial_consent', '1', true);

  UPDATE public.profiles
  SET
    testimonial_consent = false,
    testimonial_consent_withdrawn_at = withdrawn_at
  WHERE id = uid;

  DELETE FROM public.testimonials WHERE user_id = uid;

  RETURN jsonb_build_object(
    'ok', true,
    'consent_given', false,
    'withdrawn_at', withdrawn_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_my_testimonial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_my_testimonial() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_testimonial()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  t public.testimonials%ROWTYPE;
  p_consent boolean;
  p_at timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT testimonial_consent, testimonial_consent_at
    INTO p_consent, p_at
  FROM public.profiles
  WHERE id = uid;

  SELECT * INTO t FROM public.testimonials WHERE user_id = uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'exists', false,
      'consent_given', COALESCE(p_consent, false),
      'consent_given_at', p_at,
      'can_submit', public.has_active_paid_premium(uid)
    );
  END IF;

  RETURN jsonb_build_object(
    'exists', true,
    'id', t.id,
    'first_name', t.first_name,
    'subtitle', t.subtitle,
    'body', t.body,
    'avatar_url', t.avatar_url,
    'is_published', t.is_published,
    'consent_given', t.consent_given,
    'consent_given_at', t.consent_given_at,
    'created_at', t.created_at,
    'can_submit', public.has_active_paid_premium(uid)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_testimonial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_testimonial() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_published_testimonials()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'first_name', t.first_name,
        'subtitle', t.subtitle,
        'body', t.body,
        'avatar_url', t.avatar_url,
        'created_at', t.created_at
      )
      ORDER BY t.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT id, first_name, subtitle, body, avatar_url, created_at
    FROM public.testimonials
    WHERE is_published = true
      AND consent_given = true
    ORDER BY created_at DESC
    LIMIT 24
  ) t;
$$;

REVOKE ALL ON FUNCTION public.list_published_testimonials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_published_testimonials() TO anon;
GRANT EXECUTE ON FUNCTION public.list_published_testimonials() TO authenticated;

-- ===== Relance e-mail : candidats (service_role / Edge Function uniquement) =====
CREATE OR REPLACE FUNCTION public.list_testimonial_invite_candidates(
  p_limit integer DEFAULT 40
)
RETURNS TABLE(
  user_id uuid,
  email text,
  display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delay_days integer;
BEGIN
  delay_days := public.get_setting_int('testimonial_invite_delay_days', 14);

  RETURN QUERY
  SELECT
    m.user_id,
    u.email::text,
    COALESCE(NULLIF(btrim(p.display_name), ''), 'Membre')::text
  FROM public.memberships m
  JOIN auth.users u ON u.id = m.user_id
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.plan = 'premium'
    AND (m.premium_until IS NULL OR m.premium_until > now())
    AND m.paid_premium_started_at IS NOT NULL
    AND m.paid_premium_started_at <= now() - make_interval(days => delay_days)
    AND m.testimonial_invite_sent_at IS NULL
    AND p.deletion_requested_at IS NULL
    AND COALESCE(p.email_notifications_enabled, true) = true
    AND NOT EXISTS (
      SELECT 1 FROM public.testimonials t WHERE t.user_id = m.user_id
    )
    AND u.email IS NOT NULL
  ORDER BY m.paid_premium_started_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 40), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.list_testimonial_invite_candidates(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_testimonial_invite_candidates(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_testimonial_invite_sent(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('aypik.allow_paid_meta', '1', true);

  UPDATE public.memberships
  SET testimonial_invite_sent_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id
    AND testimonial_invite_sent_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_testimonial_invite_sent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_testimonial_invite_sent(uuid) TO service_role;

-- Wipe RGPD : les témoignages partent via ON DELETE CASCADE sur profiles.
-- Relance : Edge Function send-testimonial-invites (CRON_SECRET), à planifier
-- quotidiennement dans le Dashboard Supabase (ex. 09:00 UTC).

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
