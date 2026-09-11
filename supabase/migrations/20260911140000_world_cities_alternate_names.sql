-- Alias GeoNames (Hanovre, Cologne, Munich…) pour l’autocomplete hors France.

ALTER TABLE public.world_cities
  ADD COLUMN IF NOT EXISTS alternate_names text;

CREATE OR REPLACE FUNCTION public.search_world_cities(
  p_country text,
  p_query text,
  p_limit integer DEFAULT 15
)
RETURNS TABLE (
  geoname_id bigint,
  name text,
  country_code text,
  lat double precision,
  lng double precision,
  population integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.geoname_id,
    c.name,
    c.country_code,
    c.lat,
    c.lng,
    c.population
  FROM public.world_cities c
  CROSS JOIN LATERAL (
    SELECT replace(replace(replace(btrim(COALESCE(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_')
  ) AS q(needle)
  WHERE c.country_code = upper(btrim(COALESCE(p_country, '')))
    AND length(btrim(COALESCE(p_query, ''))) >= 2
    AND (
      c.name ILIKE q.needle || '%' ESCAPE '\'
      OR COALESCE(c.ascii_name, '') ILIKE q.needle || '%' ESCAPE '\'
      OR (',' || COALESCE(c.alternate_names, '') || ',')
           ILIKE '%,' || q.needle || '%' ESCAPE '\'
    )
  ORDER BY c.population DESC NULLS LAST, c.name ASC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 15), 30), 1);
$$;

REVOKE ALL ON FUNCTION public.search_world_cities(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_world_cities(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_world_cities(text, text, integer) TO service_role;
