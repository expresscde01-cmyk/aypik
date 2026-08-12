-- Align founder expiry notifications with free post-period choice
-- (cease / Freemium / Premium — no forced auto-renewal).

CREATE OR REPLACE FUNCTION process_founder_expirations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  warning_days integer;
  n_warned integer := 0;
  n_expired integer := 0;
BEGIN
  warning_days := get_setting_int('founder_warning_days', 14);

  WITH due AS (
    UPDATE memberships m
    SET founder_expiry_notified_at = now(),
        updated_at = now()
    WHERE m.is_founder = true
      AND m.founder_premium_until IS NOT NULL
      AND m.founder_premium_until > now()
      AND m.founder_premium_until <= now() + make_interval(days => warning_days)
      AND m.founder_expiry_notified_at IS NULL
    RETURNING m.user_id
  )
  INSERT INTO membership_notifications (user_id, kind, title, body)
  SELECT
    user_id,
    'founder_expiring_soon',
    'À l''échéance de vos 6 mois',
    'Vous pourrez aussi bien interrompre votre adhésion, migrer vers l''offre Freemium que passer à l''offre Premium : ce sont des options entièrement sans engagement. Aucune reconduction automatique, aucun prélèvement forcé : vous choisissez en toute liberté.'
  FROM due;

  GET DIAGNOSTICS n_warned = ROW_COUNT;

  WITH expired AS (
    UPDATE memberships m
    SET plan = 'free',
        updated_at = now()
    WHERE m.is_founder = true
      AND m.plan = 'founder'
      AND m.founder_premium_until IS NOT NULL
      AND m.founder_premium_until <= now()
    RETURNING m.user_id
  )
  INSERT INTO membership_notifications (user_id, kind, title, body)
  SELECT
    user_id,
    'founder_expired',
    'À l''échéance de vos 6 mois',
    'Vous pourrez aussi bien interrompre votre adhésion, migrer vers l''offre Freemium que passer à l''offre Premium : ce sont des options entièrement sans engagement. Aucune reconduction automatique, aucun prélèvement forcé : vous choisissez en toute liberté. Votre badge Fondateur reste visible.'
  FROM expired;

  GET DIAGNOSTICS n_expired = ROW_COUNT;

  RETURN n_warned + n_expired;
END;
$$;
