-- Cas de 20261108160000_match_seen.
-- Ce fichier ne contient pas BEGIN ni ROLLBACK.
-- La migration est déjà passée dans la même transaction.
-- Comptes 64, 32 et 43. Insertion directe dans match_bonds : pas d'e-mail.

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

CREATE FUNCTION pg_temp.non_vus(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::integer
  FROM public.match_bonds mb
  WHERE (mb.user_a = p_user OR mb.user_b = p_user)
    AND NOT EXISTS (
      SELECT 1
      FROM public.match_seen s
      WHERE s.user_id = p_user
        AND s.peer_id = CASE
          WHEN mb.user_a = p_user THEN mb.user_b
          ELSE mb.user_a
        END
    );
$$;

CREATE FUNCTION pg_temp.liens(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::integer
  FROM public.match_bonds mb
  WHERE mb.user_a = p_user OR mb.user_b = p_user;
$$;

DO $$
DECLARE
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_n integer;
  v_liens integer;
  v_err text;
BEGIN
  SELECT a, b, c INTO v_a, v_b, v_c FROM aypik_who;

  INSERT INTO aypik_out
  SELECT 1, 'match_ancien',
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM public.match_bonds
        WHERE (user_a, user_b) = (LEAST(v_a, v_b), GREATEST(v_a, v_b))
      ) THEN 'absent'
      WHEN EXISTS (
        SELECT 1 FROM public.match_seen
        WHERE user_id = v_a AND peer_id = v_b
      ) THEN 'compte_0'
      ELSE 'encore'
    END;

  INSERT INTO public.match_bonds (user_a, user_b, origin, created_at)
  VALUES (LEAST(v_a, v_c), GREATEST(v_a, v_c), 'like', now())
  ON CONFLICT (user_a, user_b) DO UPDATE
    SET created_at = now();
  DELETE FROM public.match_seen
  WHERE (user_id, peer_id) IN ((v_a, v_c), (v_c, v_a));

  INSERT INTO public.match_seen (user_id, peer_id)
  SELECT v_a, CASE WHEN mb.user_a = v_a THEN mb.user_b ELSE mb.user_a END
  FROM public.match_bonds mb
  WHERE (mb.user_a = v_a OR mb.user_b = v_a)
    AND CASE WHEN mb.user_a = v_a THEN mb.user_b ELSE mb.user_a END <> v_c
  ON CONFLICT (user_id, peer_id) DO NOTHING;

  v_n := pg_temp.non_vus(v_a);
  INSERT INTO aypik_out VALUES (
    2, 'nouveau_match', CASE WHEN v_n = 1 THEN 'compte_1' ELSE 'compte_' || v_n::text END
  );

  v_liens := pg_temp.liens(v_a);

  PERFORM set_config('request.jwt.claim.sub', v_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.mark_matches_seen(ARRAY[v_c]);
  EXECUTE 'RESET ROLE';

  v_n := pg_temp.non_vus(v_a);
  INSERT INTO aypik_out VALUES (
    3, 'apres_vu', CASE WHEN v_n = 0 THEN 'compte_0' ELSE 'compte_' || v_n::text END
  );
  INSERT INTO aypik_out VALUES (
    4,
    'pastille',
    CASE WHEN pg_temp.liens(v_a) = v_liens THEN 'inchangee' ELSE 'changee' END
  );

  INSERT INTO public.match_bonds (user_a, user_b, origin, created_at)
  VALUES (LEAST(v_b, v_c), GREATEST(v_b, v_c), 'like', now())
  ON CONFLICT (user_a, user_b) DO UPDATE
    SET created_at = now();
  DELETE FROM public.match_seen
  WHERE user_id = v_b AND peer_id = v_c;

  PERFORM set_config('request.jwt.claim.sub', v_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.mark_matches_seen(ARRAY[v_c]);
  EXECUTE 'RESET ROLE';

  INSERT INTO aypik_out
  SELECT 5, 'match_d_un_autre',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.match_seen
        WHERE user_id = v_b AND peer_id = v_c
      ) THEN 'marque'
      ELSE 'refuse'
    END;

  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.match_seen (user_id, peer_id)
    VALUES (v_a, v_b);
    v_err := 'passe';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO aypik_out VALUES (6, 'ecriture_directe', v_err);
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
