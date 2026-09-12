-- Tentative : plancher la fenêtre d'essai au 23/11/2026 pour les comptes de
-- test créés avant le lancement officiel. Revert immédiat (migration
-- suivante) : voir 20260912124811_revert_launch_anchor_keep_per_account_date.sql
-- pour le raisonnement. Conservée ici pour la parité avec l'historique
-- réellement appliqué en production.
CREATE OR REPLACE FUNCTION public._account_access_phase(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  m memberships%ROWTYPE;
  v_launch timestamptz := '2026-11-23T00:00:00+00'::timestamptz;
  v_anchor timestamptz;
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
      'payment_visible', false
    );
  END IF;

  IF COALESCE(m.is_founder, false) THEN
    v_full_until := COALESCE(m.founder_premium_until, GREATEST(m.created_at, v_launch) + interval '6 months');
    v_simplified_until := v_full_until;
  ELSE
    v_anchor := GREATEST(m.created_at, v_launch);
    v_full_until := v_anchor + interval '1 month';
    v_simplified_until := v_anchor + interval '6 months';
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
    'payment_visible', now() >= v_simplified_until
  );
END;
$$;
