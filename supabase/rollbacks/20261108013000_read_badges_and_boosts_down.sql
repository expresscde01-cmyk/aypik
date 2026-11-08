-- Retour arrière de 20261108013000_read_badges_and_boosts.
-- À lancer à la main seulement si cette étape doit être annulée.
-- Ce fichier n'est pas dans supabase/migrations : supabase db push ne l'applique pas.
-- email_dispatch_settings était déjà verrouillé (RLS forcé, aucun droit API) :
-- on ne le rouvre pas.

DROP FUNCTION IF EXISTS public.founder_public_badges(uuid[]);
DROP FUNCTION IF EXISTS public.active_boost_user_ids(uuid[]);

DROP POLICY IF EXISTS "memberships_select_own" ON public.memberships;
DROP POLICY IF EXISTS "memberships_select_all" ON public.memberships;
CREATE POLICY "memberships_select_all"
ON public.memberships
FOR SELECT
TO authenticated
USING (true);

REVOKE SELECT ON TABLE public.memberships FROM anon, authenticated;
GRANT SELECT ON TABLE public.memberships TO anon, authenticated;

DROP POLICY IF EXISTS "boosts_select_own" ON public.profile_boosts;
DROP POLICY IF EXISTS "boosts_select_all" ON public.profile_boosts;
CREATE POLICY "boosts_select_all"
ON public.profile_boosts
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "platform_settings_select_auth" ON public.platform_settings;
CREATE POLICY "platform_settings_select_auth"
ON public.platform_settings
FOR SELECT
TO authenticated
USING (true);

DROP VIEW IF EXISTS public.matches;
CREATE VIEW public.matches AS
SELECT
  l1.from_user AS user_a,
  l1.to_user AS user_b,
  l1.created_at AS matched_at
FROM public.likes l1
JOIN public.likes l2
  ON l1.from_user = l2.to_user
 AND l1.to_user = l2.from_user
 AND l1.from_user < l2.from_user;

REVOKE ALL ON TABLE public.matches FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.matches TO service_role;
