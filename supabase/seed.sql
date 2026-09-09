-- Données de test locales (`supabase db reset`). Jamais en production.
-- Connexion app : lea@aypik.test / Aypik-Test-2026!

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_password text := crypt('Aypik-Test-2026!', gen_salt('bf'));
  v_user record;
BEGIN
  -- Léa (spectatrice, Lyon) + quelques hommes internationaux / hexagone.
  FOR v_user IN
    SELECT *
    FROM (
      VALUES
        (
          '11111111-1111-1111-1111-111111111111'::uuid,
          'lea@aypik.test',
          'Léa',
          'femme'::text,
          '1994-03-12'::date,
          'Lyon (69001)',
          'Lyon',
          'FR',
          45.764043::double precision,
          4.835659::double precision,
          ARRAY['voyage', 'musique', 'cuisine']::text[]
        ),
        (
          '22222222-2222-2222-2222-222222222222'::uuid,
          'marco@aypik.test',
          'Marco',
          'homme',
          '1992-07-21'::date,
          'Rome',
          'Rome',
          'IT',
          41.902782,
          12.496366,
          ARRAY['voyage', 'football']::text[]
        ),
        (
          '33333333-3333-3333-3333-333333333333'::uuid,
          'pablo@aypik.test',
          'Pablo',
          'homme',
          '1990-11-03'::date,
          'Madrid',
          'Madrid',
          'ES',
          40.416775,
          -3.703790,
          ARRAY['musique', 'photo']::text[]
        ),
        (
          '44444444-4444-4444-4444-444444444444'::uuid,
          'kenji@aypik.test',
          'Kenji',
          'homme',
          '1993-01-18'::date,
          'Tokyo',
          'Tokyo',
          'JP',
          35.689487,
          139.691711,
          ARRAY['cuisine', 'manga']::text[]
        ),
        (
          '55555555-5555-5555-5555-555555555555'::uuid,
          'thomas@aypik.test',
          'Thomas',
          'homme',
          '1991-05-09'::date,
          'Paris (75011)',
          'Paris',
          'FR',
          48.856613,
          2.352222,
          ARRAY['voyage']::text[]
        )
    ) AS t(
      id, email, display_name, gender, birth_date,
      location, city_name, country_code, lat, lng, interests
    )
  LOOP
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      phone_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user.id,
      'authenticated',
      'authenticated',
      v_user.email,
      v_password,
      timestamptz '2026-08-01 10:00:00+00',
      timestamptz '2026-08-01 10:00:00+00',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      '{}'::jsonb,
      timestamptz '2026-08-01 10:00:00+00',
      timestamptz '2026-08-01 10:00:00+00',
      '',
      '',
      '',
      ''
    );

    INSERT INTO auth.identities (
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_user.id,
      jsonb_build_object(
        'sub', v_user.id::text,
        'email', v_user.email,
        'email_verified', true
      ),
      'email',
      v_user.id::text,
      timestamptz '2026-08-01 10:00:00+00',
      timestamptz '2026-08-01 10:00:00+00',
      timestamptz '2026-08-01 10:00:00+00'
    );

    INSERT INTO public.profiles (
      id,
      display_name,
      birth_date,
      bio,
      has_children,
      location,
      city_name,
      country_code,
      lat,
      lng,
      interests,
      gender,
      photo_url,
      created_at,
      updated_at
    ) VALUES (
      v_user.id,
      v_user.display_name,
      v_user.birth_date,
      'Profil de test local.',
      false,
      v_user.location,
      v_user.city_name,
      v_user.country_code,
      v_user.lat,
      v_user.lng,
      v_user.interests,
      v_user.gender,
      '',
      timestamptz '2026-08-01 10:00:00+00',
      timestamptz '2026-08-01 10:00:00+00'
    );
  END LOOP;

  -- Le trigger profiles_claim_membership crée déjà une ligne free.
  UPDATE public.memberships
  SET
    plan = 'founder',
    is_founder = true,
    founder_number = 1,
    founder_premium_until = timestamptz '2026-12-31 23:59:59+00'
  WHERE user_id = '11111111-1111-1111-1111-111111111111';

  PERFORM setval('public.founder_number_seq', 2, false);
END
$$;
