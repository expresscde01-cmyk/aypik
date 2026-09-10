-- Quotas d'envoi SMS (vérification téléphone) : table interne + RPC
-- service_role uniquement. Allowlist pays alignée sur Twilio Geographic
-- Permissions — France (+33) uniquement pour commencer.

INSERT INTO public.platform_settings (key, value) VALUES
  ('phone_sms_country_prefixes', '"+33"'::jsonb),
  ('phone_sms_max_per_user_24h', '3'::jsonb),
  ('phone_sms_max_per_number_24h', '3'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.phone_verification_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_verification_sends_user_created_idx
  ON public.phone_verification_sends (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS phone_verification_sends_phone_created_idx
  ON public.phone_verification_sends (phone_e164, created_at DESC);

COMMENT ON TABLE public.phone_verification_sends IS
  'Journal des demandes d’envoi SMS OTP. Accès postgres / service_role uniquement (Edge Function send-phone-verification).';

ALTER TABLE public.phone_verification_sends ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.phone_verification_sends FROM PUBLIC;
REVOKE ALL ON TABLE public.phone_verification_sends FROM anon, authenticated;
GRANT ALL ON TABLE public.phone_verification_sends TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.try_record_phone_verification_send(
  p_user_id uuid,
  p_phone_e164 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_user integer;
  max_phone integer;
  user_count integer;
  phone_count integer;
  window_start timestamptz := now() - interval '24 hours';
  phone_norm text := btrim(COALESCE(p_phone_e164, ''));
BEGIN
  IF p_user_id IS NULL OR phone_norm = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation_failed');
  END IF;

  IF phone_norm !~ '^\+[1-9][0-9]{6,14}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation_failed');
  END IF;

  PERFORM pg_advisory_xact_lock(881001, hashtext('u:' || p_user_id::text));
  PERFORM pg_advisory_xact_lock(881002, hashtext('p:' || phone_norm));

  max_user := GREATEST(1, public.get_setting_int('phone_sms_max_per_user_24h', 3));
  max_phone := GREATEST(1, public.get_setting_int('phone_sms_max_per_number_24h', 3));

  SELECT count(*)::integer INTO user_count
  FROM public.phone_verification_sends
  WHERE user_id = p_user_id
    AND created_at >= window_start;

  IF user_count >= max_user THEN
    RETURN jsonb_build_object('ok', false, 'code', 'over_sms_send_rate_limit');
  END IF;

  SELECT count(*)::integer INTO phone_count
  FROM public.phone_verification_sends
  WHERE phone_e164 = phone_norm
    AND created_at >= window_start;

  IF phone_count >= max_phone THEN
    RETURN jsonb_build_object('ok', false, 'code', 'over_sms_send_rate_limit');
  END IF;

  INSERT INTO public.phone_verification_sends (user_id, phone_e164)
  VALUES (p_user_id, phone_norm);

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.try_record_phone_verification_send(uuid, text) IS
  'Réserve un envoi SMS (max 3 / utilisateur / 24 h et 3 / numéro / 24 h). Appel service_role uniquement.';

REVOKE ALL ON FUNCTION public.try_record_phone_verification_send(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_record_phone_verification_send(uuid, text)
  TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.get_setting_text(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_setting_int(text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
