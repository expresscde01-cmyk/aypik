-- CORRECTIF DE SÉCURITÉ : sur ce projet, les privilèges par défaut du schéma
-- "public" accordent EXECUTE directement aux rôles anon/authenticated/service_role
-- à la création de toute fonction (voir pg_default_acl). "REVOKE ALL ... FROM PUBLIC"
-- ne retire PAS ces droits, car ils sont accordés nommément à anon/authenticated,
-- pas via PUBLIC. Résultat vérifié : ensure_match_bond, finalize_reciprocal_match,
-- request_social_email, pair_match_bond_exists, notify_on_mutual_like,
-- mark_notification_emailed, mark_flash_notification_emailed, send_flash et send_like
-- étaient TOUTES exécutables par le rôle anon (utilisateur non authentifié) via
-- /rest/v1/rpc/<nom_fonction>, malgré les REVOKE précédents.
--
-- Le plus grave : ensure_match_bond et finalize_reciprocal_match n'ont AUCUNE
-- vérification d'identité interne (pas de auth.uid()) — n'importe qui, même sans
-- compte, pouvait forcer un match_bond entre deux utilisateurs arbitraires.

REVOKE ALL ON FUNCTION public.ensure_match_bond(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_reciprocal_match(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pair_match_bond_exists(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_mutual_like() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_social_email(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.mark_notification_emailed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_emailed(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.mark_flash_notification_emailed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_flash_notification_emailed(uuid) TO service_role;

-- send_flash / send_like : doivent rester appelables par les utilisateurs connectés,
-- mais jamais par anon (ils gèrent déjà leur propre vérification auth.uid(), mais
-- autant fermer complètement l'accès anonyme au niveau des droits Postgres).
REVOKE ALL ON FUNCTION public.send_flash(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_flash(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.send_like(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_like(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
