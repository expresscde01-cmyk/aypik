-- Cas de 20261108140000_profile_photo_signs.
-- Ce fichier ne contient pas BEGIN ni ROLLBACK.
-- Tant que la migration n'est pas en production, la lancer dans la même transaction.
-- Comptes 64, 32 et 43. Aucun e-mail.

CREATE TEMP TABLE aypik_who AS
SELECT
  a.id AS a,
  b.id AS b,
  c.id AS c
FROM public.memberships ma
JOIN public.profiles a ON a.id = ma.user_id AND ma.founder_number = 64
JOIN public.memberships mb ON mb.founder_number = 32
JOIN public.profiles b ON b.id = mb.user_id
JOIN public.memberships mc ON mc.founder_number = 43
JOIN public.profiles c ON c.id = mc.user_id;

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

INSERT INTO aypik_out (ord, cas, resultat)
SELECT 0, 'ecriture_storage',
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
  )
  AND (
    coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
    || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
  ) LIKE '%foldername%'
  AND (
    coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
    || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
  ) LIKE '%auth.uid()%';

GRANT ALL ON aypik_who TO authenticated;
GRANT ALL ON aypik_out TO authenticated;

SELECT set_config('request.jwt.claim.sub', (SELECT a::text FROM aypik_who), true);
SELECT set_config(
  'request.jwt.claims',
  (SELECT json_build_object('sub', a, 'role', 'authenticated')::text FROM aypik_who),
  true
);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_err text;
  v_ok boolean;
BEGIN
  BEGIN
    UPDATE public.profiles
    SET photo_url = (SELECT a::text FROM aypik_who) || '/avatar-test.jpeg'
    WHERE id = (SELECT a FROM aypik_who);
    SELECT photo_url = lower((SELECT a::text FROM aypik_who)) || '/avatar-test.jpeg'
    INTO v_ok
    FROM public.profiles
    WHERE id = (SELECT a FROM aypik_who);
    INSERT INTO aypik_out VALUES (1, 'chemin_propre', CASE WHEN v_ok THEN 'accepte' ELSE 'non' END);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO aypik_out VALUES (1, 'chemin_propre', SQLSTATE);
  END;

  BEGIN
    UPDATE public.profiles
    SET photo_url = (SELECT b::text FROM aypik_who) || '/avatar-test.jpeg'
    WHERE id = (SELECT a FROM aypik_who);
    v_err := 'passe';
  EXCEPTION WHEN OTHERS THEN
    v_err := CASE
      WHEN SQLERRM LIKE '%photo_url_not_in_own_bucket%' THEN 'refuse'
      ELSE SQLSTATE
    END;
  END;
  INSERT INTO aypik_out VALUES (2, 'chemin_autre_dossier', v_err);

  BEGIN
    UPDATE public.profiles
    SET photo_url = (SELECT a::text FROM aypik_who) || '/../autre.jpeg'
    WHERE id = (SELECT a FROM aypik_who);
    v_err := 'passe';
  EXCEPTION WHEN OTHERS THEN
    v_err := CASE
      WHEN SQLERRM LIKE '%photo_url_not_in_own_bucket%' THEN 'refuse'
      ELSE SQLSTATE
    END;
  END;
  INSERT INTO aypik_out VALUES (3, 'chemin_traverse', v_err);

  BEGIN
    UPDATE public.profiles
    SET photo_url =
      'https://dtsyeouinmpjvdgwkncu.supabase.co/storage/v1/object/public/profile-photos/'
      || (SELECT a::text FROM aypik_who) || '/avatar-test.jpeg'
    WHERE id = (SELECT a FROM aypik_who);
    v_err := 'accepte';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLSTATE;
  END;
  INSERT INTO aypik_out VALUES (4, 'url_projet', v_err);

  BEGIN
    UPDATE public.profiles
    SET photo_url =
      'https://autreprojet.supabase.co/storage/v1/object/public/profile-photos/'
      || (SELECT a::text FROM aypik_who) || '/avatar-test.jpeg'
    WHERE id = (SELECT a FROM aypik_who);
    v_err := 'passe';
  EXCEPTION WHEN OTHERS THEN
    v_err := CASE
      WHEN SQLERRM LIKE '%photo_url_not_in_own_bucket%' THEN 'refuse'
      ELSE SQLSTATE
    END;
  END;
  INSERT INTO aypik_out VALUES (5, 'url_autre_projet', v_err);
END $$;

RESET ROLE;

DO $$
DECLARE
  v_paths text[];
  v_n integer;
  v_hits integer;
  v_ok boolean;
  v_err text;
BEGIN
  SELECT cardinality(public.prepare_profile_photo_signs(
    a, ARRAY[a::text || '/moi.jpeg']
  )) INTO v_n FROM aypik_who;
  INSERT INTO aypik_out VALUES (6, 'signer_soi', CASE WHEN v_n = 1 THEN 'oui' ELSE 'non' END);

  SELECT cardinality(public.prepare_profile_photo_signs(
    a, ARRAY[b::text || '/elle.jpeg']
  )) INTO v_n FROM aypik_who;
  INSERT INTO aypik_out VALUES (7, 'signer_fiche_visible', CASE WHEN v_n = 1 THEN 'oui' ELSE 'non' END);

  UPDATE public.profiles p
  SET paused_at = now()
  FROM aypik_who w
  WHERE p.id = w.b;
  SELECT cardinality(public.prepare_profile_photo_signs(
    a, ARRAY[b::text || '/elle.jpeg']
  )) INTO v_n FROM aypik_who;
  INSERT INTO aypik_out VALUES (8, 'signer_pause', CASE WHEN v_n = 0 THEN 'exclu' ELSE 'encore' END);
  UPDATE public.profiles p SET paused_at = NULL FROM aypik_who w WHERE p.id = w.b;

  PERFORM set_config('aypik.allow_deletion_ts', '1', true);
  UPDATE public.profiles p
  SET deletion_requested_at = now()
  FROM aypik_who w
  WHERE p.id = w.b;
  SELECT cardinality(public.prepare_profile_photo_signs(
    a, ARRAY[b::text || '/elle.jpeg']
  )) INTO v_n FROM aypik_who;
  INSERT INTO aypik_out VALUES (9, 'signer_suppression', CASE WHEN v_n = 0 THEN 'exclu' ELSE 'encore' END);
  UPDATE public.profiles p SET deletion_requested_at = NULL FROM aypik_who w WHERE p.id = w.b;

  INSERT INTO public.inbox_responses (user_id, actor_id, decision, origin)
  SELECT a, b, 'refuse', 'like' FROM aypik_who
  ON CONFLICT (user_id, actor_id) DO UPDATE
    SET decision = 'refuse', updated_at = now();
  SELECT cardinality(public.prepare_profile_photo_signs(
    a, ARRAY[b::text || '/elle.jpeg']
  )) INTO v_n FROM aypik_who;
  INSERT INTO aypik_out VALUES (10, 'signer_refus', CASE WHEN v_n = 0 THEN 'exclu' ELSE 'encore' END);

  SELECT array_agg(a::text || '/f' || g.i || '.jpeg')
  INTO v_paths
  FROM aypik_who
  CROSS JOIN generate_series(1, 101) AS g(i);
  BEGIN
    PERFORM public.prepare_profile_photo_signs((SELECT a FROM aypik_who), v_paths);
    v_err := 'passe';
  EXCEPTION WHEN OTHERS THEN
    v_err := CASE
      WHEN SQLERRM LIKE '%photo_sign_chunk_too_large%' THEN 'refuse'
      ELSE SQLSTATE
    END;
  END;
  INSERT INTO aypik_out VALUES (11, 'cent_un_chemins', v_err);

  INSERT INTO public.profile_read_windows (user_id, kind, window_start, fiches)
  SELECT a, 'minute', date_trunc('minute', now()), 5000 FROM aypik_who
  ON CONFLICT (user_id, kind, window_start) DO UPDATE SET fiches = 5000;
  SELECT count(*) INTO v_hits
  FROM public.profile_read_limit_hits h
  JOIN aypik_who w ON w.a = h.user_id
  WHERE h.kind = 'minute' AND h.at > now() - interval '1 minute';
  SELECT public.prepare_profile_photo_signs(a, ARRAY[a::text || '/moi.jpeg']) IS NULL
  INTO v_ok
  FROM aypik_who;
  INSERT INTO aypik_out VALUES (
    12,
    'plafond',
    CASE
      WHEN v_ok AND (
        SELECT count(*)
        FROM public.profile_read_limit_hits h
        JOIN aypik_who w ON w.a = h.user_id
        WHERE h.kind = 'minute' AND h.at > now() - interval '1 minute'
      ) > v_hits THEN 'journal'
      ELSE 'non'
    END
  );
END $$;

SET LOCAL ROLE authenticated;

DO $$
BEGIN
  BEGIN
    PERFORM public.prepare_profile_photo_signs(
      (SELECT a FROM aypik_who),
      ARRAY[(SELECT a::text FROM aypik_who) || '/moi.jpeg']
    );
    INSERT INTO aypik_out VALUES (13, 'appel_navigateur', 'encore');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO aypik_out VALUES (13, 'appel_navigateur', SQLSTATE);
  WHEN OTHERS THEN
    INSERT INTO aypik_out VALUES (13, 'appel_navigateur', SQLSTATE);
  END;
END $$;

RESET ROLE;

DO $$
DECLARE
  v_texte text;
BEGIN
  SELECT string_agg(q.cas || ' : ' || q.resultat, E'\n' ORDER BY q.ord)
  INTO v_texte
  FROM aypik_out q;
  RAISE EXCEPTION 'AYPIK_RESULTS %', v_texte;
END $$;
