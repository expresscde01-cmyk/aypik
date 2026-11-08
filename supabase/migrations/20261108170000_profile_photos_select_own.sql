-- L'envoi avec upsert relit la ligne qu'il vient d'écrire.
-- Sans politique SELECT, Postgres refuse : new row violates row-level security policy.
-- Le membre ne lit que son dossier. anon et les autres dossiers restent fermés.

DROP POLICY IF EXISTS "profile_photos_select_own" ON storage.objects;
CREATE POLICY "profile_photos_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

NOTIFY pgrst, 'reload schema';
