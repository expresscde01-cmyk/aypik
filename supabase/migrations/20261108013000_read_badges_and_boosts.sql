-- Étape 2 (lectures) : badges, boosts, réglages, vue matches.
-- Les anciennes migrations ne sont pas modifiées.
-- Les écrans restent les mêmes : le badge et le boost passent par des fonctions.

-- Chaque compte ne lit que sa ligne d'abonnement.
DROP POLICY IF EXISTS "memberships_select_all" ON public.memberships;
DROP POLICY IF EXISTS "memberships_select_own" ON public.memberships;
CREATE POLICY "memberships_select_own"
ON public.memberships
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Un REVOKE de colonnes ne retire rien tant que le SELECT de la table existe.
-- On retire ce droit, puis on le rend colonne par colonne, sans les identifiants de paiement.
REVOKE SELECT ON TABLE public.memberships FROM anon, authenticated;
GRANT SELECT (
  user_id,
  plan,
  is_founder,
  founder_number,
  founder_premium_until,
  premium_until,
  founder_expiry_notified_at,
  created_at,
  updated_at,
  payment_provider,
  welcome_email_sent_at,
  paid_premium_started_at,
  testimonial_invite_sent_at,
  trial_expiry_notified_at,
  premium_expiry_notified_for,
  visibilite_until,
  francophone_until,
  international_until,
  visibilite_expiry_notified_for,
  francophone_expiry_notified_for,
  international_expiry_notified_for,
  founder_boosts_remaining,
  founder_boosts_expire_at,
  pending_plan,
  pending_plan_at,
  premium_boosts_remaining,
  premium_boosts_period_end
) ON TABLE public.memberships TO authenticated;

-- Badge des autres : seulement fondateur ou non, et le numéro.
CREATE OR REPLACE FUNCTION public.founder_public_badges(p_ids uuid[])
RETURNS TABLE(user_id uuid, is_founder boolean, founder_number integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.user_id, m.is_founder, m.founder_number
  FROM public.memberships m
  WHERE auth.uid() IS NOT NULL
    AND p_ids IS NOT NULL
    AND cardinality(p_ids) BETWEEN 1 AND 80
    AND m.user_id = ANY (p_ids)
    AND m.is_founder;
$$;

REVOKE EXECUTE ON FUNCTION public.founder_public_badges(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.founder_public_badges(uuid[]) TO authenticated;

-- Un boost en cours : seulement l'identifiant du profil, pas le paiement.
DROP POLICY IF EXISTS "boosts_select_all" ON public.profile_boosts;
DROP POLICY IF EXISTS "boosts_select_own" ON public.profile_boosts;
CREATE POLICY "boosts_select_own"
ON public.profile_boosts
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.active_boost_user_ids(p_ids uuid[])
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT b.user_id
  FROM public.profile_boosts b
  WHERE auth.uid() IS NOT NULL
    AND p_ids IS NOT NULL
    AND cardinality(p_ids) BETWEEN 1 AND 80
    AND b.user_id = ANY (p_ids)
    AND b.payment_status IN ('paid', 'simulated')
    AND b.ends_at > now();
$$;

REVOKE EXECUTE ON FUNCTION public.active_boost_user_ids(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.active_boost_user_ids(uuid[]) TO authenticated;

-- Aucune lecture de platform_settings dans le navigateur.
-- Les deux edge functions (Stripe, PayPal) lisent payments_enabled avec service_role,
-- qui contourne le RLS. Le compteur Fondateur passe déjà par get_founder_slot_status.
DROP POLICY IF EXISTS "platform_settings_select_auth" ON public.platform_settings;

-- Réglages d'envoi d'e-mails : RLS actif, aucune politique pour l'API.
ALTER TABLE public.email_dispatch_settings ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_dispatch_settings'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.email_dispatch_settings',
      pol.policyname
    );
  END LOOP;
END
$$;
REVOKE ALL ON TABLE public.email_dispatch_settings FROM PUBLIC, anon, authenticated;

-- Vue matches : aucun fonction, trigger ni edge function n'en dépend.
DROP VIEW IF EXISTS public.matches;

-- Aucune page publique ni edge function ne lit cette table avec la clé anon.
-- Les paiements passent par service_role. Un visiteur sans compte n'a plus aucun droit.
REVOKE ALL ON TABLE public.payment_subscriptions FROM anon;
