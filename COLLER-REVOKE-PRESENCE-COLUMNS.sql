-- Coller TOUT ce fichier dans Supabase → SQL Editor, puis Run.
-- Empêche SELECT direct de last_active_at et incognito_at (API PostgREST).
-- card_profiles / suggest_profiles / touch_my_presence restent SECURITY DEFINER
-- (elles lisent encore ces colonnes en tant que propriétaire de la fonction).
--
-- Un REVOKE SELECT (colonne) seul ne suffit pas si authenticated a un GRANT SELECT
-- (ou ALL) sur la table entière : on retire le SELECT table, puis on re-accorde
-- toutes les colonnes sauf last_active_at et incognito_at.

CREATE OR REPLACE FUNCTION public.my_account_flags()
RETURNS TABLE (
  paused_at timestamptz,
  incognito_at timestamptz,
  deactivated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.paused_at, p.incognito_at, p.deactivated_at
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_account_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_account_flags() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_account_flags() TO service_role;

-- Garder le masquage côté RPC même si le script présence n’a pas été rejoué.
DO $$
BEGIN
  ALTER FUNCTION public.card_profiles(uuid[]) SECURITY DEFINER;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
  ALTER FUNCTION public.suggest_profiles(integer, boolean, integer, text, text, numeric, text, timestamptz, uuid[])
    SECURITY DEFINER;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
  ALTER FUNCTION public.touch_my_presence() SECURITY DEFINER;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;

REVOKE SELECT ON TABLE public.profiles FROM PUBLIC;
REVOKE SELECT ON TABLE public.profiles FROM anon;
REVOKE SELECT ON TABLE public.profiles FROM authenticated;

DO $$
BEGIN
  EXECUTE 'REVOKE SELECT (last_active_at) ON public.profiles FROM PUBLIC';
  EXECUTE 'REVOKE SELECT (last_active_at) ON public.profiles FROM anon';
  EXECUTE 'REVOKE SELECT (last_active_at) ON public.profiles FROM authenticated';
EXCEPTION
  WHEN undefined_column OR undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'REVOKE SELECT (incognito_at) ON public.profiles FROM PUBLIC';
  EXECUTE 'REVOKE SELECT (incognito_at) ON public.profiles FROM anon';
  EXECUTE 'REVOKE SELECT (incognito_at) ON public.profiles FROM authenticated';
EXCEPTION
  WHEN undefined_column OR undefined_object THEN NULL;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT grantee::text AS g
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name IN ('last_active_at', 'incognito_at')
      AND privilege_type = 'SELECT'
      AND grantee NOT IN (
        'postgres',
        'service_role',
        'supabase_admin',
        'supabase_auth_admin'
      )
  LOOP
    IF r.g = 'PUBLIC' THEN
      EXECUTE 'REVOKE SELECT (last_active_at, incognito_at) ON public.profiles FROM PUBLIC';
    ELSE
      BEGIN
        EXECUTE format(
          'REVOKE SELECT (last_active_at, incognito_at) ON public.profiles FROM %I',
          r.g
        );
      EXCEPTION
        WHEN undefined_object THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position)
  INTO cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'profiles'
    AND c.column_name NOT IN ('last_active_at', 'incognito_at');

  IF cols IS NULL OR cols = '' THEN
    RAISE EXCEPTION 'profiles : impossible de reconstruire le GRANT SELECT colonnes';
  END IF;

  EXECUTE format(
    'GRANT SELECT (%s) ON public.profiles TO authenticated',
    cols
  );
END $$;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
