-- Bascule des photos : les URL publiques deviennent des chemins,
-- puis le bucket n'est plus public. À appliquer seulement quand le site
-- qui signe est déjà en ligne.

UPDATE public.profiles
SET photo_url = substring(
  regexp_replace(btrim(photo_url), '[?#].*$', '')
  FROM '/profile-photos/(.+)$'
)
WHERE photo_url LIKE 'https://dtsyeouinmpjvdgwkncu.supabase.co/storage/v1/%/profile-photos/%';

UPDATE public.profiles
SET photo_url = NULL
WHERE photo_url IS NOT NULL
  AND photo_url LIKE 'http%';

UPDATE storage.buckets
SET public = false
WHERE id = 'profile-photos';

DROP POLICY IF EXISTS "profile_photos_public_read" ON storage.objects;

NOTIFY pgrst, 'reload schema';
