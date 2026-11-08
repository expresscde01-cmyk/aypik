-- Retour arrière de 20261108150000_profile_photos_private.
-- À lancer à la main seulement. supabase db push ne l'applique pas.
-- Les adresses qui avaient été effacées (autre hôte) ne peuvent pas revenir.

UPDATE storage.buckets
SET public = true
WHERE id = 'profile-photos';

DROP POLICY IF EXISTS "profile_photos_public_read" ON storage.objects;
CREATE POLICY "profile_photos_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-photos');

UPDATE public.profiles
SET photo_url =
  'https://dtsyeouinmpjvdgwkncu.supabase.co/storage/v1/object/public/profile-photos/'
  || photo_url
WHERE photo_url ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$';

NOTIFY pgrst, 'reload schema';
