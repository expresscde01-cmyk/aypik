-- Retour arrière de 20261108170000_profile_photos_select_own.
-- À lancer à la main seulement. supabase db push ne l'applique pas.
-- L'envoi avec upsert redevient refusé.

DROP POLICY IF EXISTS "profile_photos_select_own" ON storage.objects;

NOTIFY pgrst, 'reload schema';
