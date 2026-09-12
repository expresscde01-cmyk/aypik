-- OBSOLÈTE — remplacé par supabase/migrations/20260910173743_suggest_profiles_require_gender.sql, ne pas exécuter.
-- Ce fichier ne définit plus suggest_profiles.
--
-- Ancienne copie (lecture seule, collage bloqué) : deprecated/COLLER-DISCOVERY-CATALOG.sql
-- Ne pas coller d’ancien COLLER-* qui CREATE OR REPLACE suggest_profiles :
-- cela écraserait le masquage 3 mois des profils refusés.

DO $$ BEGIN
  RAISE EXCEPTION 'OBSOLÈTE : ne pas coller COLLER-DISCOVERY-CATALOG.sql. Source : supabase/migrations/20260910173743_suggest_profiles_require_gender.sql';
END $$;
