-- Cas de 20261108130000_profile_client_writes.
-- Ce fichier ne contient pas BEGIN ni ROLLBACK.
-- Tant que la migration n'est pas en production, la lancer dans la même transaction, avant ce fichier.
-- Comptes : 64, 32, 43. Aucun e-mail n'est envoyé : insert_chat_message ne passe pas par pg_net.

CREATE TEMP TABLE aypik_who (
  a uuid,
  b uuid,
  c uuid,
  match_ac boolean,
  msgs_ac integer,
  opened_c boolean,
  orig_paused_at timestamptz,
  orig_incognito_at timestamptz,
  orig_deactivated_at timestamptz
);

INSERT INTO aypik_who (
  a, b, c, match_ac, msgs_ac, opened_c,
  orig_paused_at, orig_incognito_at, orig_deactivated_at
)
SELECT
  a.id,
  b.id,
  c.id,
  EXISTS (
    SELECT 1 FROM public.match_bonds mb
    WHERE mb.user_a = least(a.id, c.id)
      AND mb.user_b = greatest(a.id, c.id)
  ),
  (
    SELECT count(*)::integer
    FROM public.messages m
    WHERE (m.sender_id = a.id AND m.recipient_id = c.id)
       OR (m.sender_id = c.id AND m.recipient_id = a.id)
  ),
  false,
  a.paused_at,
  a.incognito_at,
  a.deactivated_at
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

CREATE TEMP TABLE aypik_avant AS
SELECT
  m.founder_number,
  m.plan,
  m.is_founder,
  m.founder_premium_until,
  p.discover_mode,
  p.accepts_messages_without_match,
  p.messages_without_match_notice_seen,
  (p.paused_at IS NOT NULL) AS paused,
  (p.incognito_at IS NOT NULL) AS incognito,
  (p.deactivated_at IS NOT NULL) AS deactivated
FROM public.memberships m
JOIN public.profiles p ON p.id = m.user_id
WHERE m.founder_number IN (64, 32, 43);

CREATE TEMP TABLE aypik_out (
  ord integer,
  cas text,
  resultat text
);

CREATE TEMP TABLE aypik_mine AS
SELECT
  p.id,
  p.display_name,
  p.birth_date,
  p.bio,
  p.has_children,
  p.location,
  p.country_code,
  p.city_name,
  p.geoname_id,
  p.interests,
  p.photo_url,
  p.gender,
  p.lat,
  p.lng,
  p.preferred_locale,
  p.email_notifications_enabled,
  p.temperament,
  p.languages,
  p.greeting_name_color,
  p.discover_mode,
  p.paused_at,
  p.incognito_at,
  p.deactivated_at,
  p.accepts_messages_without_match,
  p.messages_without_match_notice_seen,
  p.last_active_at
FROM public.profiles p
JOIN aypik_who w ON w.a = p.id;

CREATE FUNCTION pg_temp.fiche_etat(p_id uuid)
RETURNS TABLE(active_now boolean, lat_r numeric, lng_r numeric, trois boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (p.last_active_at = now()),
    round(p.lat::numeric, 2),
    round(p.lng::numeric, 2),
    (
      p.paused_at IS NOT NULL
      AND p.incognito_at IS NOT NULL
      AND p.deactivated_at IS NOT NULL
    )
  FROM public.profiles p
  WHERE p.id = p_id;
$$;

GRANT ALL ON aypik_who TO authenticated;
GRANT ALL ON aypik_avant TO authenticated;
GRANT ALL ON aypik_out TO authenticated;
GRANT ALL ON aypik_mine TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fiche_etat(uuid) TO authenticated;

INSERT INTO aypik_out (ord, cas, resultat)
SELECT 0, 'update_table',
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.role_table_grants g
      WHERE g.table_schema = 'public'
        AND g.table_name = 'profiles'
        AND g.grantee = 'authenticated'
        AND g.privilege_type = 'UPDATE'
    ) THEN 'encore_sur_la_table'
    ELSE 'retire'
  END;

UPDATE public.profiles p
SET accepts_messages_without_match = true
FROM aypik_who w
WHERE p.id = w.c
  AND NOT p.accepts_messages_without_match;

UPDATE aypik_who
SET opened_c = true
WHERE EXISTS (
  SELECT 1 FROM aypik_avant
  WHERE founder_number = 43
    AND NOT accepts_messages_without_match
);

DELETE FROM public.messages m
USING aypik_who w
WHERE (m.sender_id = w.a AND m.recipient_id = w.c)
   OR (m.sender_id = w.c AND m.recipient_id = w.a);

DELETE FROM public.message_openers_daily d
USING aypik_who w
WHERE d.user_id = w.a
  AND d.day = (timezone('Europe/Paris', now()))::date;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT a::text FROM aypik_who),
  true
);
SELECT set_config(
  'request.jwt.claims',
  (SELECT json_build_object('sub', a, 'role', 'authenticated')::text FROM aypik_who),
  true
);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_err text;
  v_code text;
  v_at timestamptz;
  v_lat double precision;
  v_lng double precision;
  v_ok boolean;
BEGIN
  BEGIN
    UPDATE public.profiles p
    SET
      display_name = s.display_name,
      birth_date = s.birth_date,
      bio = s.bio,
      has_children = s.has_children,
      location = s.location,
      country_code = s.country_code,
      city_name = s.city_name,
      geoname_id = s.geoname_id,
      interests = s.interests,
      photo_url = s.photo_url,
      gender = s.gender,
      lat = s.lat,
      lng = s.lng,
      preferred_locale = s.preferred_locale,
      email_notifications_enabled = s.email_notifications_enabled,
      temperament = s.temperament,
      languages = s.languages,
      greeting_name_color = s.greeting_name_color,
      discover_mode = s.discover_mode,
      paused_at = s.paused_at,
      incognito_at = s.incognito_at,
      deactivated_at = s.deactivated_at,
      accepts_messages_without_match = s.accepts_messages_without_match,
      messages_without_match_notice_seen = s.messages_without_match_notice_seen,
      last_active_at = s.last_active_at
    FROM aypik_mine s
    WHERE p.id = s.id;
    INSERT INTO aypik_out VALUES (1, 'colonnes_du_site', 'passent');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO aypik_out VALUES (1, 'colonnes_du_site', left(SQLERRM, 160));
  END;

  BEGIN
    UPDATE public.profiles
    SET photo_url = 'https://example.com/dehors.jpg'
    WHERE id = (SELECT a FROM aypik_who);
    v_err := 'passee';
  EXCEPTION WHEN OTHERS THEN
    v_err := CASE
      WHEN SQLERRM LIKE '%photo_url_not_in_own_bucket%' THEN 'refusee'
      ELSE SQLSTATE
    END;
  END;
  INSERT INTO aypik_out VALUES (2, 'photo_exterieure', v_err);

  BEGIN
    UPDATE public.profiles
    SET photo_url =
      'https://autreprojet.supabase.co/storage/v1/object/public/profile-photos/'
      || (SELECT a::text FROM aypik_who)
      || '/avatar-test.jpeg'
    WHERE id = (SELECT a FROM aypik_who);
    v_err := 'passee';
  EXCEPTION WHEN OTHERS THEN
    v_err := CASE
      WHEN SQLERRM LIKE '%photo_url_not_in_own_bucket%' THEN 'refusee'
      ELSE SQLSTATE
    END;
  END;
  INSERT INTO aypik_out VALUES (3, 'photo_autre_projet', v_err);

  BEGIN
    UPDATE public.profiles
    SET photo_url =
      'https://dtsyeouinmpjvdgwkncu.supabase.co/storage/v1/object/public/profile-photos/'
      || (SELECT a::text FROM aypik_who)
      || '/avatar-test.jpeg'
    WHERE id = (SELECT a FROM aypik_who);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
    INSERT INTO aypik_out VALUES (3, 'photo_dossier', SQLSTATE);
  END;
  IF v_ok THEN
    SELECT photo_url LIKE 'https://dtsyeouinmpjvdgwkncu.supabase.co/storage/v1/object/public/profile-photos/%/avatar-test.jpeg'
    INTO v_ok
    FROM public.profiles
    WHERE id = (SELECT a FROM aypik_who);
    INSERT INTO aypik_out VALUES (
      3, 'photo_dossier', CASE WHEN v_ok THEN 'acceptee' ELSE 'non_enregistree' END
    );
  END IF;

  BEGIN
    UPDATE public.profiles
    SET last_active_at = now() + interval '30 days'
    WHERE id = (SELECT a FROM aypik_who);
    SELECT e.active_now INTO v_ok
    FROM pg_temp.fiche_etat((SELECT a FROM aypik_who)) e;
    INSERT INTO aypik_out VALUES (
      4,
      'last_active_futur',
      CASE WHEN v_ok THEN 'remplace_par_now' ELSE 'non_remplace' END
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO aypik_out VALUES (4, 'last_active_futur', left(SQLERRM, 160));
  END;

  BEGIN
    UPDATE public.profiles
    SET lat = 91, lng = 2
    WHERE id = (SELECT a FROM aypik_who);
    v_err := 'passee';
  EXCEPTION WHEN OTHERS THEN
    v_err := CASE
      WHEN SQLERRM LIKE '%profile_coordinates_out_of_range%' THEN 'refusee'
      ELSE SQLSTATE
    END;
  END;
  INSERT INTO aypik_out VALUES (5, 'position_impossible', v_err);

  BEGIN
    UPDATE public.profiles
    SET lat = 48.856, lng = 2.352
    WHERE id = (SELECT a FROM aypik_who);
    SELECT e.lat_r, e.lng_r INTO v_lat, v_lng
    FROM pg_temp.fiche_etat((SELECT a FROM aypik_who)) e;
    INSERT INTO aypik_out VALUES (
      6,
      'position_valide',
      CASE
        WHEN v_lat = 48.86 AND v_lng = 2.35 THEN 'arrondie'
        ELSE 'non_arrondie'
      END
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO aypik_out VALUES (6, 'position_valide', left(SQLERRM, 160));
  END;

  BEGIN
    UPDATE public.profiles
    SET created_at = now()
    WHERE id = (SELECT a FROM aypik_who);
    v_code := 'passee';
  EXCEPTION WHEN insufficient_privilege THEN
    v_code := SQLSTATE;
  WHEN OTHERS THEN
    v_code := SQLSTATE;
  END;
  INSERT INTO aypik_out VALUES (7, 'colonne_interdite', v_code);

  BEGIN
    UPDATE public.profiles
    SET
      paused_at = now(),
      incognito_at = now(),
      deactivated_at = now()
    WHERE id = (SELECT a FROM aypik_who);
    SELECT e.trois INTO v_ok
    FROM pg_temp.fiche_etat((SELECT a FROM aypik_who)) e;
    INSERT INTO aypik_out VALUES (
      8, 'pause_incognito_desactivation',
      CASE WHEN v_ok THEN 'passent' ELSE 'non_enregistrees' END
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO aypik_out VALUES (8, 'pause_incognito_desactivation', left(SQLERRM, 160));
  END;

  UPDATE public.profiles p
  SET
    paused_at = w.orig_paused_at,
    incognito_at = w.orig_incognito_at,
    deactivated_at = w.orig_deactivated_at
  FROM aypik_who w
  WHERE p.id = w.a;

  BEGIN
    PERFORM public.is_open_messaging_profile((SELECT b FROM aypik_who));
    INSERT INTO aypik_out VALUES (9, 'is_open_messaging_profile', 'encore_appelable');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO aypik_out VALUES (9, 'is_open_messaging_profile', SQLSTATE);
  WHEN OTHERS THEN
    INSERT INTO aypik_out VALUES (9, 'is_open_messaging_profile', SQLSTATE);
  END;

  BEGIN
    PERFORM public.insert_chat_message((SELECT c FROM aypik_who), 'essai');
    INSERT INTO aypik_out
    SELECT 10, 'premier_message_sans_match',
      CASE WHEN match_ac THEN 'envoye_mais_match' ELSE 'envoye' END
    FROM aypik_who;
  EXCEPTION WHEN OTHERS THEN
    v_err := CASE
      WHEN SQLERRM LIKE '%recipient_declines_messages_without_match%' THEN 'destinataire_ferme'
      WHEN SQLERRM LIKE '%sender_plan_required%' THEN 'offre_requise'
      WHEN SQLERRM LIKE '%messages_without_match_daily_limit%' THEN 'plafond'
      WHEN SQLERRM LIKE '%member_unavailable%' THEN 'indisponible'
      WHEN SQLERRM LIKE '%permission denied%' THEN '42501'
      ELSE SQLSTATE
    END;
    INSERT INTO aypik_out VALUES (10, 'premier_message_sans_match', v_err);
  END;
END $$;

RESET ROLE;

DO $$
DECLARE
  v_texte text;
BEGIN
  SELECT string_agg(
    q.cas || ' : ' || q.resultat,
    E'\n' ORDER BY q.ord
  )
  INTO v_texte
  FROM (
    SELECT ord, cas, resultat FROM aypik_out
    UNION ALL
    SELECT 20, 'avant_' || founder_number::text,
      plan || ' fondateur=' || is_founder::text
      || ' jusquau=' || COALESCE(founder_premium_until::date::text, '')
      || ' mode=' || COALESCE(discover_mode, '')
      || ' messages_sans_match=' || accepts_messages_without_match::text
      || ' annonce_vue=' || messages_without_match_notice_seen::text
      || ' pause=' || paused::text
    FROM aypik_avant
    UNION ALL
    SELECT 30, 'match_64_43', CASE WHEN match_ac THEN 'oui' ELSE 'non' END
    FROM aypik_who
    UNION ALL
    SELECT 31, 'messages_64_43_avant', msgs_ac::text FROM aypik_who
    UNION ALL
    SELECT 32, 'compte_43_ouvert_dans_le_test',
      CASE WHEN opened_c THEN 'oui' ELSE 'non' END
    FROM aypik_who
  ) q;

  RAISE EXCEPTION 'AYPIK_RESULTS %', v_texte;
END $$;
