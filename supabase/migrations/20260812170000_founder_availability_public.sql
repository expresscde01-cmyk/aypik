/*
  Disponibilité Fondateur (lecture publique) pour le badge psychologique
  sur la landing, sans exposer d’autres données membership.
*/

CREATE OR REPLACE FUNCTION get_founder_availability()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_slots integer;
  taken integer;
  remaining integer;
BEGIN
  max_slots := get_setting_int('founder_max_slots', 500);
  taken := count_founders();
  remaining := GREATEST(max_slots - taken, 0);

  RETURN jsonb_build_object(
    'founders_taken', taken,
    'founders_max', max_slots,
    'founders_remaining', remaining,
    'founder_open', remaining > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION get_founder_availability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_founder_availability() TO anon;
GRANT EXECUTE ON FUNCTION get_founder_availability() TO authenticated;
