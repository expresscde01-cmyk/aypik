-- OBSOLÈTE — remplacé par supabase/migrations/20260910173743_suggest_profiles_require_gender.sql, ne pas exécuter.
-- Ce fichier ne définit plus suggest_profiles.
--
-- Ancienne copie (lecture seule, collage bloqué) : deprecated/COLLER-PROFILE-PAUSE.sql
-- Pause profil : voir supabase/migrations (paused_at). Ne pas recoller l’ancienne RPC.

DO $$ BEGIN
  RAISE EXCEPTION 'OBSOLÈTE : ne pas coller COLLER-PROFILE-PAUSE.sql. Source : supabase/migrations/20260910173743_suggest_profiles_require_gender.sql';
END $$;
