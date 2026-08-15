-- Audit + durcissement RLS (à coller dans Supabase SQL Editor)
-- 1) Active RLS sur toute table public qui ne l'a pas
-- 2) Force RLS (même pour le propriétaire de table)
-- 3) Affiche un rapport des tables / politiques
--
-- Note : les politiques « TO authenticated » empêchent déjà anon
-- d'accéder aux données. L'anon key côté client est publique par design ;
-- la protection réelle = RLS + jamais de service_role dans le front.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE 'pg_%'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      r.tbl
    );
    RAISE NOTICE 'RLS activé sur public.%', r.tbl;
  END LOOP;

  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND NOT c.relforcerowsecurity
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',
      r.tbl
    );
    RAISE NOTICE 'FORCE RLS sur public.%', r.tbl;
  END LOOP;
END $$;

-- Rapport : tables sans RLS (doit être vide après le DO)
SELECT
  n.nspname AS schema,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- Rapport : politiques (vérifier qu'aucune n'est TO public/anon en écriture)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Tables accessibles en SELECT pour le rôle anon (doit être vide ou lecture volontaire)
SELECT
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('SELECT', 'ALL', 'INSERT', 'UPDATE', 'DELETE')
  AND (
    'anon' = ANY (roles)
    OR 'public' = ANY (roles)
  )
ORDER BY tablename, policyname;
