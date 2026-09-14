-- Compteur public des places Fondateur (landing, bandeaux, CGU).
-- SQL déjà appliqué en prod (SQL Editor) le 2026-09-14 sur dtsyeouinmpjvdgwkncu.
-- Ne pas rejouer : uniquement marquer applied dans schema_migrations
-- (`supabase migration repair --status applied 20260914190000`).
--
-- Le front ne lit que founder_offer_closed. founders_remaining n’est pas affiché.

CREATE OR REPLACE FUNCTION public.get_founder_slot_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  taken integer;
  max_slots integer;
  remaining integer;
BEGIN
  max_slots := GREATEST(1, get_setting_int('founder_max_slots', 1000));
  taken := count_founders();
  remaining := GREATEST(0, max_slots - taken);
  RETURN jsonb_build_object(
    'founders_taken', taken,
    'founders_max', max_slots,
    'founders_remaining', remaining,
    'founder_offer_closed', remaining <= 0
  );
END;
$$;

COMMENT ON FUNCTION public.get_founder_slot_status() IS
  'Compteur public des places Membre Fondateur (landing / CGU). Aucune donnée nominative.';

REVOKE ALL ON FUNCTION public.get_founder_slot_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_founder_slot_status() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
