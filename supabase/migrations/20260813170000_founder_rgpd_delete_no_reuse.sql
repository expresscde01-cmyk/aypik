-- RGPD : suppression de compte = wipe intégral du statut Fondateur.
-- Le trigger d’identité bloque uniquement les UPDATE (pas DELETE / CASCADE).
-- Les numéros ne sont jamais réattribués (séquence + MAX+1, jamais le plus petit trou).

COMMENT ON COLUMN memberships.is_founder IS
  'Tant que la ligne existe : une fois true, jamais remis à false par UPDATE. Effacé avec le compte (DELETE / CASCADE).';
COMMENT ON COLUMN memberships.founder_number IS
  'Numéro unique jamais réattribué. Effacé avec le compte ; le prochain claim prend MAX+1 (pas les trous).';

-- Séquence monotone : survit aux DELETE, ne recycle pas les trous ni le max.
CREATE SEQUENCE IF NOT EXISTS public.founder_number_seq
  AS integer
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

DO $$
DECLARE
  mx integer;
  seq_last bigint;
  seq_called boolean;
  current_next bigint;
  needed_next bigint;
BEGIN
  SELECT COALESCE(MAX(founder_number), 0) INTO mx FROM public.memberships;
  needed_next := mx + 1;
  SELECT last_value, is_called INTO seq_last, seq_called
  FROM public.founder_number_seq;
  current_next := CASE WHEN seq_called THEN seq_last + 1 ELSE seq_last END;
  IF current_next < needed_next THEN
    PERFORM setval('public.founder_number_seq', needed_next, false);
  END IF;
END $$;

-- UPDATE only : ne jamais empêcher DELETE (compte / CASCADE auth.users).
CREATE OR REPLACE FUNCTION protect_founder_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF OLD.is_founder IS TRUE THEN
    NEW.is_founder := true;
  END IF;
  IF OLD.founder_number IS NOT NULL THEN
    NEW.founder_number := OLD.founder_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memberships_protect_founder_identity ON memberships;
DROP TRIGGER IF EXISTS protect_founder_identity ON memberships;
DROP TRIGGER IF EXISTS memberships_protect_founder_identity_del ON memberships;

CREATE TRIGGER memberships_protect_founder_identity
BEFORE UPDATE ON memberships
FOR EACH ROW
EXECUTE FUNCTION protect_founder_identity();

-- FK : wipe memberships (donc is_founder + founder_number) avec auth.users.
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'memberships'
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%auth.users%';

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.memberships DROP CONSTRAINT %I', conname);
  END IF;

  ALTER TABLE public.memberships
    ADD CONSTRAINT memberships_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
END $$;

GRANT DELETE ON TABLE public.memberships TO service_role;

CREATE OR REPLACE FUNCTION try_claim_founder_slot(p_user_id uuid)
RETURNS memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_slots integer;
  months integer;
  next_number integer;
  result memberships;
BEGIN
  SELECT * INTO result FROM memberships WHERE user_id = p_user_id;
  IF FOUND THEN
    IF result.is_founder OR result.plan = 'founder' THEN
      PERFORM grant_founder_first_month_boost(p_user_id);
    END IF;
    RETURN result;
  END IF;

  max_slots := get_setting_int('founder_max_slots', 500);
  months := get_setting_int('founder_premium_months', 6);

  PERFORM pg_advisory_xact_lock(872014);

  IF count_founders() >= max_slots THEN
    INSERT INTO memberships (user_id, plan, is_founder)
    VALUES (p_user_id, 'free', false)
    RETURNING * INTO result;
    RETURN result;
  END IF;

  -- Jamais le plus petit numéro libre : MAX historique (séquence) + MAX restant.
  SELECT COALESCE(MAX(founder_number), 0) INTO next_number FROM memberships;
  next_number := GREATEST(nextval('public.founder_number_seq'), next_number + 1);
  PERFORM setval('public.founder_number_seq', next_number, true);

  INSERT INTO memberships (
    user_id,
    plan,
    is_founder,
    founder_number,
    founder_premium_until
  ) VALUES (
    p_user_id,
    'founder',
    true,
    next_number,
    now() + make_interval(months => months)
  )
  RETURNING * INTO result;

  PERFORM grant_founder_first_month_boost(p_user_id);

  INSERT INTO membership_notifications (user_id, kind, title, body)
  VALUES (
    p_user_id,
    'founder_welcome',
    'Bienvenue, Membre Fondateur',
    'Vous faites partie des 500 premiers. Likes illimités, coup de cœur et boost profil offert le 1er mois, avec votre badge distinctif à vie.'
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION try_claim_founder_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION try_claim_founder_slot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION delete_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Wipe explicite du statut Fondateur (is_founder + founder_number).
  -- Le reste suit via ON DELETE CASCADE depuis auth.users.
  DELETE FROM public.memberships WHERE user_id = uid;

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION delete_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_account() TO authenticated;

NOTIFY pgrst, 'reload schema';
