/*
  Boost 24h — activation après paiement réel (Stripe / PayPal).
  purchase_boost reste disponible en filet (simu / prolongement local).
*/

CREATE OR REPLACE FUNCTION activate_paid_boost(
  p_user_id uuid DEFAULT NULL,
  p_provider text DEFAULT 'stripe',
  p_payment_ref text DEFAULT NULL
)
RETURNS profile_boosts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := COALESCE(p_user_id, auth.uid());
  result profile_boosts;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_provider IS NULL OR p_provider NOT IN ('stripe', 'paypal') THEN
    RAISE EXCEPTION 'invalid_provider';
  END IF;

  -- Prolongation si un boost actif existe déjà
  UPDATE profile_boosts
  SET ends_at = GREATEST(ends_at, now()) + interval '24 hours',
      payment_status = 'paid',
      amount_cents = 299
  WHERE user_id = uid
    AND payment_status IN ('paid', 'simulated')
    AND ends_at > now()
  RETURNING * INTO result;

  IF FOUND THEN
    INSERT INTO membership_notifications (user_id, kind, title, body)
    VALUES (
      uid,
      'boost_activated',
      'Boost prolongé',
      'Votre profil reste mis en avant pour 24 heures supplémentaires (paiement confirmé).'
    );
    RETURN result;
  END IF;

  INSERT INTO profile_boosts (user_id, starts_at, ends_at, payment_status, amount_cents)
  VALUES (uid, now(), now() + interval '24 hours', 'paid', 299)
  RETURNING * INTO result;

  INSERT INTO membership_notifications (user_id, kind, title, body)
  VALUES (
    uid,
    'boost_activated',
    'Boost activé',
    'Votre profil est mis en avant pendant 24 heures (paiement confirmé).'
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION activate_paid_boost(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION activate_paid_boost(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION activate_paid_boost(uuid, text, text) TO service_role;
