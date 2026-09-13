-- Collages SQL Editor du 12/09 : absorbés par le dépôt. Ne pas les recréer.
--
-- Noms vus en prod (pas de fichier git du même nom)     → source de vérité git
--   essentiel_and_addon_offers                          → 20260913180000_offer_grid_v3.sql
--   essentiel_and_addon_status_and_reminders            → 20260912125623_membership_expiry_reminders.sql
--   suggest_profiles_gate_geo_addons                    → offer_clamp_discover_args (v3)
--                                                       + 20260913180100_offer_search_lock.sql
--                                                       + 20260913200000_suggest_profiles_open_messaging.sql
--
-- Staging / reconstruction : rejouer supabase/migrations dans l'ordre des
-- timestamps. Ne pas aller chercher ces 3 noms en prod « au cas par cas ».
-- confort_premium_tiers a déjà 20260912164143_confort_premium_tiers.sql.
--
-- Ce fichier est idempotent (prod déjà à jour : no-op utile).

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS visibilite_until timestamptz,
  ADD COLUMN IF NOT EXISTS francophone_until timestamptz,
  ADD COLUMN IF NOT EXISTS international_until timestamptz;

DROP FUNCTION IF EXISTS public.activate_paid_addon(uuid, text, text, timestamptz);

COMMENT ON FUNCTION public.offer_clamp_discover_args(uuid, text, integer) IS
  'Verrou Découvrir par palier (ex-suggest_profiles_gate_geo_addons). Gratuit : régions voisines, repli national si pas de voisine. Basique : national. Essentiel+ : personnalisable, dégradation geo selon droits payés.';

COMMENT ON FUNCTION public.offer_has_francophone_access(uuid) IS
  'Droit portée francophone (ex-essentiel_and_addon_offers).';

COMMENT ON FUNCTION public.offer_has_international_access(uuid) IS
  'Droit portée internationale (ex-essentiel_and_addon_offers).';

COMMENT ON FUNCTION public.offer_has_visibility_access(uuid) IS
  'Droit Incognito / pause / masquage (ex-essentiel_and_addon_offers).';

COMMENT ON FUNCTION public.activate_paid_addon(uuid, text, timestamptz) IS
  'Active visibilite | francophone | international. Signature unique (uuid, text, timestamptz), service_role. Reliquat (uuid, text, text, timestamptz) supprimé.';

COMMENT ON FUNCTION public.process_membership_expiry_reminders() IS
  'Rappels d''échéance (ex-essentiel_and_addon_status_and_reminders).';
