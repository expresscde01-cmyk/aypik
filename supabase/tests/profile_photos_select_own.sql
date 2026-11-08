-- Cas de 20261108170000_profile_photos_select_own.
-- Ce fichier ne contient pas BEGIN ni ROLLBACK.
-- La politique est créée dans la transaction, puis annulée avec elle.
-- Comptes 64, 32 et 43. Aucun e-mail.

CREATE TEMP TABLE aypik_who AS
SELECT
  a.id AS a,
  b.id AS b,
  c.id AS c,
  coalesce(pa.photo_url, '') AS photo_a
FROM public.memberships ma
JOIN public.profiles pa ON pa.id = ma.user_id AND ma.founder_number = 64
JOIN public.memberships mb ON mb.founder_number = 32
JOIN public.profiles b ON b.id = mb.user_id
JOIN public.memberships mc ON mc.founder_number = 43
JOIN public.profiles c ON c.id = mc.user_id
JOIN public.profiles a ON a.id = pa.id;

DO $$
BEGIN
  IF (SELECT count(*) FROM aypik_who) <> 1 THEN
    RAISE EXCEPTION 'comptes 64, 32 ou 43 introuvables';
  END IF;
END $$;

CREATE TEMP TABLE aypik_out (
  ord integer,
  cas text,
  resultat text
);

GRANT ALL ON aypik_who TO authenticated, anon;
GRANT ALL ON aypik_out TO authenticated, anon;

CREATE FUNCTION pg_temp.classe(p_etat text, p_message text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_etat = '42501'
      OR p_message LIKE '%new row violates row-level security%' THEN 'rls'
    WHEN p_etat = '23505' THEN 'existe'
    ELSE p_etat
  END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.classe(text, text) TO authenticated, anon;

SELECT set_config('request.jwt.claim.sub', (SELECT a::text FROM aypik_who), true);
SELECT set_config(
  'request.jwt.claims',
  (SELECT json_build_object('sub', a, 'role', 'authenticated')::text FROM aypik_who),
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_nom text := (SELECT a::text FROM aypik_who) || '/avatar-select-own.jpeg';
  v_lu text;
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id, is_versioned)
    VALUES ('profile-photos', v_nom, (SELECT a::text FROM aypik_who), false)
    ON CONFLICT (bucket_id, name) WHERE NOT is_versioned
    DO UPDATE SET updated_at = now()
    RETURNING name INTO v_lu;
    INSERT INTO aypik_out VALUES (1, 'upsert_sans_select', 'passe');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO aypik_out VALUES (1, 'upsert_sans_select', pg_temp.classe(SQLSTATE, SQLERRM));
  END;
END $$;

RESET ROLE;

DROP POLICY IF EXISTS "profile_photos_select_own" ON storage.objects;
CREATE POLICY "profile_photos_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

SELECT set_config('request.jwt.claim.sub', (SELECT a::text FROM aypik_who), true);
SELECT set_config(
  'request.jwt.claims',
  (SELECT json_build_object('sub', a, 'role', 'authenticated')::text FROM aypik_who),
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_nom text := (SELECT a::text FROM aypik_who) || '/avatar-select-own.jpeg';
  v_autre text := (SELECT b::text FROM aypik_who) || '/avatar-select-own.jpeg';
  v_lus integer;
  v_ok boolean;
  v_lu text;
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id, is_versioned)
    VALUES ('profile-photos', v_nom, (SELECT a::text FROM aypik_who), false)
    ON CONFLICT (bucket_id, name) WHERE NOT is_versioned
    DO UPDATE SET updated_at = now()
    RETURNING name INTO v_lu;
    INSERT INTO aypik_out VALUES (
      2, 'upsert_avec_select', CASE WHEN v_lu = v_nom THEN 'passe' ELSE 'non' END
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO aypik_out VALUES (2, 'upsert_avec_select', pg_temp.classe(SQLSTATE, SQLERRM));
  END;

  SELECT count(*) INTO v_lus
  FROM storage.objects
  WHERE bucket_id = 'profile-photos' AND name = v_nom;
  INSERT INTO aypik_out VALUES (3, 'lecture_propre', v_lus::text);

  SELECT count(*) INTO v_lus
  FROM storage.objects
  WHERE bucket_id = 'profile-photos' AND name = v_autre;
  INSERT INTO aypik_out VALUES (4, 'lecture_autre_absente', v_lus::text);

  BEGIN
    UPDATE public.profiles
    SET photo_url = (SELECT a::text FROM aypik_who) || '/avatar-select-own.jpeg'
    WHERE id = (SELECT a FROM aypik_who);
    SELECT photo_url = lower((SELECT a::text FROM aypik_who)) || '/avatar-select-own.jpeg'
    INTO v_ok
    FROM public.profiles
    WHERE id = (SELECT a FROM aypik_who);
    INSERT INTO aypik_out VALUES (
      5, 'trigger_chemin', CASE WHEN v_ok THEN 'accepte' ELSE 'non' END
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO aypik_out VALUES (5, 'trigger_chemin', pg_temp.classe(SQLSTATE, SQLERRM));
  END;

  UPDATE public.profiles
  SET photo_url = nullif((SELECT photo_a FROM aypik_who), '')
  WHERE id = (SELECT a FROM aypik_who);
END $$;

RESET ROLE;

INSERT INTO storage.objects (bucket_id, name, owner_id, is_versioned)
SELECT 'profile-photos', b::text || '/avatar-select-other.jpeg', b::text, false
FROM aypik_who
ON CONFLICT (bucket_id, name) WHERE NOT is_versioned
DO UPDATE SET updated_at = now();

SELECT set_config('request.jwt.claim.sub', (SELECT a::text FROM aypik_who), true);
SELECT set_config(
  'request.jwt.claims',
  (SELECT json_build_object('sub', a, 'role', 'authenticated')::text FROM aypik_who),
  true
);
SET LOCAL ROLE authenticated;

INSERT INTO aypik_out (ord, cas, resultat)
SELECT 6, 'lecture_dossier_autre', count(*)::text
FROM storage.objects
WHERE bucket_id = 'profile-photos'
  AND name = (SELECT b::text FROM aypik_who) || '/avatar-select-other.jpeg';

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_lus integer;
BEGIN
  BEGIN
    SELECT count(*) INTO v_lus
    FROM storage.objects
    WHERE bucket_id = 'profile-photos'
      AND name LIKE '%/avatar-select-%';
    INSERT INTO aypik_out VALUES (
      7, 'anon', CASE WHEN v_lus = 0 THEN 'rien' ELSE v_lus::text END
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO aypik_out VALUES (7, 'anon', pg_temp.classe(SQLSTATE, SQLERRM));
  END;
END $$;

RESET ROLE;

INSERT INTO aypik_out (ord, cas, resultat)
SELECT 8, 'fiche_64',
  CASE
    WHEN coalesce(p.photo_url, '') = (SELECT photo_a FROM aypik_who) THEN 'inchangee'
    ELSE 'modifiee'
  END
FROM public.profiles p
WHERE p.id = (SELECT a FROM aypik_who);

DO $$
DECLARE
  v_texte text;
BEGIN
  SELECT string_agg(cas || ' : ' || resultat, E'\n' ORDER BY ord)
  INTO v_texte
  FROM aypik_out;
  RAISE EXCEPTION 'AYPIK_RESULTS %', v_texte;
END $$;
