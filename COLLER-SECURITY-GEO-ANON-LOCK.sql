-- Restreindre les tables géo de référence : plus de SELECT pour anon.
-- (Le front utilise déjà le miroir TS src/lib/geoProximity.ts.)

DROP POLICY IF EXISTS department_regions_select ON public.department_regions;
CREATE POLICY department_regions_select
  ON public.department_regions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS region_neighbors_select ON public.region_neighbors;
CREATE POLICY region_neighbors_select
  ON public.region_neighbors FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.department_regions FROM anon;
REVOKE ALL ON public.region_neighbors FROM anon;
GRANT SELECT ON public.department_regions TO authenticated, service_role;
GRANT SELECT ON public.region_neighbors TO authenticated, service_role;

-- Contrôle : doit renvoyer 0 ligne
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    'anon' = ANY (roles)
    OR 'public' = ANY (roles)
  )
ORDER BY tablename, policyname;
