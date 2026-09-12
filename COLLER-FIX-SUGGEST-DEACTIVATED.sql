-- OBSOLÈTE — remplacé par supabase/migrations/20260910173743_suggest_profiles_require_gender.sql, ne pas exécuter.
-- Ce fichier ne définit plus suggest_profiles.
--
-- Ancienne copie (lecture seule, collage bloqué) : deprecated/COLLER-FIX-SUGGEST-DEACTIVATED.sql
-- Filtre deactivated_at : déjà dans la RPC actuelle. Ne pas recoller ce collage.

DO $$ BEGIN
  RAISE EXCEPTION 'OBSOLÈTE : ne pas coller COLLER-FIX-SUGGEST-DEACTIVATED.sql. Source : supabase/migrations/20260910173743_suggest_profiles_require_gender.sql';
END $$;
