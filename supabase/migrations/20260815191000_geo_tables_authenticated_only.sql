-- Geo reference tables: authenticated read only (no anon).

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
