-- Période d'essai messagerie : 6 mois pour un Fondateur (inchangé,
-- founder_premium_until / created_at + 6 mois), 1 mois pour tout autre
-- compte, toujours depuis la date d'inscription individuelle.
-- Avant : non-Fondateur = 1 mois trial_full + 5 mois trial_simplified
-- (messagerie jusqu'à 6 mois). Après : simplified_free_until = +1 mois
-- → post_trial dès J+30, donc insert_chat_message exige un plan payant.
CREATE OR REPLACE FUNCTION public._account_access_phase(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  m memberships%ROWTYPE;
  v_full_until timestamptz;
  v_simplified_until timestamptz;
  v_phase text;
BEGIN
  SELECT * INTO m FROM memberships WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'phase', 'trial_full',
      'full_access_until', null,
      'simplified_free_until', null,
      'payment_visible', false,
      'has_messaging_access', true
    );
  END IF;

  IF COALESCE(m.is_founder, false) THEN
    v_full_until := COALESCE(m.founder_premium_until, m.created_at + interval '6 months');
    v_simplified_until := v_full_until;
  ELSE
    v_full_until := m.created_at + interval '1 month';
    v_simplified_until := m.created_at + interval '1 month';
  END IF;

  IF now() < v_full_until THEN
    v_phase := CASE WHEN COALESCE(m.is_founder, false) THEN 'founder_full' ELSE 'trial_full' END;
  ELSIF now() < v_simplified_until THEN
    v_phase := 'trial_simplified';
  ELSE
    v_phase := 'post_trial';
  END IF;

  RETURN jsonb_build_object(
    'phase', v_phase,
    'full_access_until', v_full_until,
    'simplified_free_until', v_simplified_until,
    'payment_visible', now() >= v_simplified_until,
    'has_messaging_access',
      (v_phase IS DISTINCT FROM 'post_trial')
      OR public.has_active_premium(p_user_id)
  );
END;
$$;
