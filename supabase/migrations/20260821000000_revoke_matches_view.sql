-- Retire l'acces public a la vue matches (Security Definer, sans filtre RLS).
-- Cette vue exposait TOUS les couples user_a/user_b de la plateforme via l'API
-- publique (clé anon), sans filtrage par utilisateur. Non utilisée par le
-- front-end (qui passe par match_bonds, protege par RLS).

REVOKE ALL ON public.matches FROM anon, authenticated;