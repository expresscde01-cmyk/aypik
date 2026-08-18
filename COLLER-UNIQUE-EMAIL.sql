-- Coller TOUT ce fichier dans Supabase → SQL Editor, puis Run.
-- Unicité des comptes : une adresse e-mail = un seul compte.

-- Unicité des comptes par e-mail (insensible à la casse).
-- Une adresse ne peut être rattachée qu’à un seul compte auth.users.
-- Après suppression RGPD, l’e-mail est libéré (ON DELETE CASCADE / ligne auth supprimée).

CREATE OR REPLACE FUNCTION public.normalize_login_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(COALESCE(p_email, '')));
$$;

-- Index unique case-insensitive. Ignoré s’il existe déjà des doublons
-- (le trigger ci-dessous bloque alors les nouvelles insertions).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'auth'
      AND indexname = 'users_normalized_email_unique'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users
    WHERE email IS NOT NULL
      AND btrim(email) <> ''
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE
      'Doublons e-mail déjà présents : index unique non créé. Nettoyer auth.users puis relancer.';
    RETURN;
  END IF;

  EXECUTE $idx$
    CREATE UNIQUE INDEX users_normalized_email_unique
    ON auth.users (lower(btrim(email)))
    WHERE email IS NOT NULL AND btrim(email) <> ''
  $idx$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Pas le droit de créer l’index sur auth.users (unicité via trigger).';
  WHEN unique_violation THEN
    RAISE NOTICE 'Doublons e-mail : index unique non créé.';
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_unique_account_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized text := public.normalize_login_email(NEW.email);
  other uuid;
BEGIN
  IF normalized = '' THEN
    RETURN NEW;
  END IF;

  SELECT u.id INTO other
  FROM auth.users u
  WHERE public.normalize_login_email(u.email) = normalized
    AND u.id IS DISTINCT FROM NEW.id
  LIMIT 1;

  IF other IS NOT NULL THEN
    RAISE EXCEPTION 'email_exists'
      USING ERRCODE = '23505',
            HINT = 'Un compte existe déjà avec cette adresse e-mail. Connecte-toi plutôt.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_unique_account_email ON auth.users;
CREATE TRIGGER trg_enforce_unique_account_email
BEFORE INSERT OR UPDATE OF email
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.enforce_unique_account_email();

CREATE OR REPLACE FUNCTION public.enforce_unique_identity_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized text;
  owner uuid;
BEGIN
  normalized := public.normalize_login_email(NEW.identity_data->>'email');
  IF normalized = '' AND NEW.provider = 'email' THEN
    normalized := public.normalize_login_email(NEW.provider_id);
  END IF;
  IF normalized = '' THEN
    RETURN NEW;
  END IF;

  SELECT u.id INTO owner
  FROM auth.users u
  WHERE public.normalize_login_email(u.email) = normalized
  LIMIT 1;

  IF owner IS NOT NULL AND owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'email_exists'
      USING ERRCODE = '23505',
            HINT = 'Un compte existe déjà avec cette adresse e-mail. Connecte-toi plutôt.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_unique_identity_email ON auth.identities;
CREATE TRIGGER trg_enforce_unique_identity_email
BEFORE INSERT OR UPDATE OF identity_data, provider_id, user_id
ON auth.identities
FOR EACH ROW
EXECUTE FUNCTION public.enforce_unique_identity_email();

-- Lookup public pour le front (inscription) : e-mail déjà associé à un compte.
CREATE OR REPLACE FUNCTION public.email_is_registered(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE public.normalize_login_email(u.email) = public.normalize_login_email(p_email)
      AND public.normalize_login_email(p_email) <> ''
  );
$$;

COMMENT ON FUNCTION public.email_is_registered(text) IS
  'Vrai si un compte auth existe déjà pour cet e-mail (casse ignorée).';

REVOKE ALL ON FUNCTION public.email_is_registered(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_is_registered(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
