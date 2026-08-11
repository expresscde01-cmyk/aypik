/*
# Infrastructure abonnement Premium (Stripe + PayPal)

Tables de suivi des abonnements récurrents et colonnes de liaison
sur memberships. Le tarif de référence reste platform_settings.premium_price_cents (1999).
*/

CREATE TABLE IF NOT EXISTS payment_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'paypal')),
  provider_subscription_id text,
  provider_customer_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'active',
      'past_due',
      'canceled',
      'incomplete',
      'trialing'
    )),
  amount_cents integer NOT NULL DEFAULT 1999,
  currency text NOT NULL DEFAULT 'EUR',
  interval text NOT NULL DEFAULT 'month',
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_subs_provider_id
  ON payment_subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_subs_user
  ON payment_subscriptions(user_id, created_at DESC);

ALTER TABLE payment_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_subs_select_own" ON payment_subscriptions;
CREATE POLICY "payment_subs_select_own"
ON payment_subscriptions FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS payment_subscriptions_updated_at ON payment_subscriptions;
CREATE TRIGGER payment_subscriptions_updated_at
BEFORE UPDATE ON payment_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS paypal_subscriber_id text,
  ADD COLUMN IF NOT EXISTS payment_provider text
    CHECK (payment_provider IS NULL OR payment_provider IN ('stripe', 'paypal', 'founder'));

-- Active Premium payant (hors période fondateur gratuite)
CREATE OR REPLACE FUNCTION activate_paid_premium(
  p_user_id uuid,
  p_provider text,
  p_period_end timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO memberships (user_id, plan, premium_until, payment_provider)
  VALUES (
    p_user_id,
    'premium',
    COALESCE(p_period_end, now() + interval '1 month'),
    p_provider
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan = 'premium',
    premium_until = COALESCE(p_period_end, now() + interval '1 month'),
    payment_provider = p_provider,
    updated_at = now();

  INSERT INTO membership_notifications (user_id, kind, title, body)
  VALUES (
    p_user_id,
    'premium_activated',
    'Premium activé',
    'Merci pour votre soutien. Votre abonnement Premium est actif. Vous pouvez le résilier à tout moment en un clic depuis votre profil.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION cancel_paid_premium(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m memberships%ROWTYPE;
BEGIN
  SELECT * INTO m FROM memberships WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Ne pas retirer le badge fondateur ; bascule freemium si plus de période fondateur active
  IF m.is_founder
     AND m.founder_premium_until IS NOT NULL
     AND m.founder_premium_until > now() THEN
    UPDATE memberships
    SET plan = 'founder',
        payment_provider = 'founder',
        updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE memberships
    SET plan = 'free',
        premium_until = NULL,
        payment_provider = NULL,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  UPDATE payment_subscriptions
  SET status = 'canceled',
      cancel_at_period_end = true,
      updated_at = now()
  WHERE user_id = p_user_id
    AND status IN ('active', 'past_due', 'incomplete', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION activate_paid_premium(uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_paid_premium(uuid) FROM PUBLIC;
-- Appelées uniquement depuis les Edge Functions (service role)
