-- Cas de 20261108150000_profile_photos_private.
-- Ce fichier ne contient pas BEGIN ni ROLLBACK.
-- La migration est déjà passée dans la même transaction. Rien n'est conservé.
-- Comptes 64, 32 et 43.

CREATE TEMP TABLE aypik_out (
  ord integer,
  cas text,
  resultat text
);

INSERT INTO aypik_out (ord, cas, resultat)
SELECT 1, 'bucket',
  CASE WHEN public IS FALSE THEN 'prive' ELSE 'encore_public' END
FROM storage.buckets
WHERE id = 'profile-photos';

INSERT INTO aypik_out (ord, cas, resultat)
SELECT 2, 'lecture_publique',
  CASE WHEN count(*) = 0 THEN 'retiree' ELSE 'encore' END
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
WHERE nsp.nspname = 'storage'
  AND cls.relname = 'objects'
  AND pol.polname = 'profile_photos_public_read';

INSERT INTO aypik_out (ord, cas, resultat)
SELECT 3, 'ecriture_storage',
  CASE WHEN count(*) = 3 THEN 'dossier_du_compte' ELSE 'a_revoir' END
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
WHERE nsp.nspname = 'storage'
  AND cls.relname = 'objects'
  AND pol.polname IN (
    'profile_photos_insert_own',
    'profile_photos_update_own',
    'profile_photos_delete_own'
  );

INSERT INTO aypik_out (ord, cas, resultat)
SELECT 4, 'urls_projet_restantes',
  CASE WHEN count(*) = 0 THEN 'aucune' ELSE count(*)::text END
FROM public.profiles
WHERE photo_url LIKE 'https://dtsyeouinmpjvdgwkncu.supabase.co/%';

DO $$
DECLARE
  v_id uuid;
  v_photo text;
  v_gone boolean;
BEGIN
  SELECT p.id INTO v_id
  FROM public.profiles p
  JOIN public.memberships m ON m.user_id = p.id
  WHERE m.founder_number = 64;

  UPDATE public.profiles
  SET photo_url =
    'https://dtsyeouinmpjvdgwkncu.supabase.co/storage/v1/object/public/profile-photos/'
    || v_id::text || '/avatar-test.jpeg?t=1'
  WHERE id = v_id;

  UPDATE public.profiles
  SET photo_url = substring(
    regexp_replace(btrim(photo_url), '[?#].*$', '')
    FROM '/profile-photos/(.+)$'
  )
  WHERE id = v_id
    AND photo_url LIKE 'https://dtsyeouinmpjvdgwkncu.supabase.co/storage/v1/%/profile-photos/%';

  SELECT photo_url INTO v_photo FROM public.profiles WHERE id = v_id;
  INSERT INTO aypik_out VALUES (
    5,
    'conversion_url',
    CASE
      WHEN v_photo = v_id::text || '/avatar-test.jpeg' THEN 'chemin'
      ELSE 'non'
    END
  );

  UPDATE public.profiles
  SET photo_url = 'https://example.com/dehors.jpg'
  WHERE id = v_id;
  UPDATE public.profiles
  SET photo_url = NULL
  WHERE id = v_id
    AND photo_url LIKE 'http%';
  SELECT photo_url IS NULL INTO v_gone FROM public.profiles WHERE id = v_id;
  INSERT INTO aypik_out VALUES (
    6,
    'autre_hote',
    CASE WHEN v_gone THEN 'effacee' ELSE 'gardee' END
  );
END $$;

DO $$
DECLARE
  v_texte text;
BEGIN
  SELECT string_agg(q.cas || ' : ' || q.resultat, E'\n' ORDER BY q.ord)
  INTO v_texte
  FROM aypik_out q;
  RAISE EXCEPTION 'AYPIK_RESULTS %', v_texte;
END $$;
