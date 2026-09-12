-- Retour à un calcul purement basé sur la date d'inscription propre à
-- chaque compte (memberships.created_at), sans plancher au 23/11/2026.
-- Le plafonnement introduit dans la migration précédente créait une
-- incohérence avec le mécanisme Fondateur déjà en place (founder_premium_until
-- n'est, lui, jamais re-ancré) et contredisait l'instruction explicite et
-- répétée : la bascule se fait "à partir de la date d'inscription de
-- l'utilisateur", sans référence à une date de lancement commune. Voir la
-- note laissée pour l'utilisateur sur les comptes de test antérieurs au
-- 23/11/2026 dans notes-paywall-aypik.md.
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
      'payment_visible', false
    );
  END IF;

  IF COALESCE(m.is_founder, false) THEN
    v_full_until := COALESCE(m.founder_premium_until, m.created_at + interval '6 months');
    v_simplified_until := v_full_until;
  ELSE
    v_full_until := m.created_at + interval '1 month';
    v_simplified_until := m.created_at + interval '6 months';
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
