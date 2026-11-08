-- Écriture de sa fiche : seulement les colonnes que le site envoie.
-- Le trigger ne s'applique qu'au rôle authenticated.
-- is_open_messaging_profile n'est plus appelable par le navigateur.
-- suggest_profiles_core et insert_chat_message (SECURITY DEFINER) continuent de l'appeler.

REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.column_name)
  INTO cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'profiles';

  IF cols IS NULL OR cols = '' THEN
    RAISE EXCEPTION 'profiles : aucune colonne à révoquer';
  END IF;

  EXECUTE format(
    'REVOKE UPDATE (%s) ON TABLE public.profiles FROM PUBLIC, anon, authenticated',
    cols
  );
END $$;

-- Colonnes écrites par le site :
-- display_name, birth_date, bio, has_children, location, country_code, city_name,
-- geoname_id, interests, photo_url, gender, lat, lng, preferred_locale,
-- email_notifications_enabled, temperament, languages, greeting_name_color
--   → ProfileSetup (Mon profil), applyLocale, EmailNotificationsProfileCard,
--     TemperamentOnboarding, LanguagesOnboarding, PaymentCheckoutModal,
--     profileCoordinates
-- discover_mode → DiscoverModeSwitcher
-- paused_at → profilePause
-- incognito_at → profileIncognito
-- deactivated_at → profileDeactivated
-- accepts_messages_without_match, messages_without_match_notice_seen → AccountMenu
-- last_active_at → le client peut l'envoyer, le trigger le remplace par now()
--   (le heartbeat réel passe par touch_my_presence, SECURITY DEFINER)
GRANT UPDATE (
  display_name,
  birth_date,
  bio,
  has_children,
  location,
  country_code,
  city_name,
  geoname_id,
  interests,
  photo_url,
  gender,
  lat,
  lng,
  preferred_locale,
  email_notifications_enabled,
  temperament,
  languages,
  greeting_name_color,
  discover_mode,
  paused_at,
  incognito_at,
  deactivated_at,
  accepts_messages_without_match,
  messages_without_match_notice_seen,
  last_active_at
) ON TABLE public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_profile_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_path text;
  v_folder text;
BEGIN
  IF current_user IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.photo_url IS DISTINCT FROM OLD.photo_url THEN
    IF NEW.photo_url IS NULL OR btrim(NEW.photo_url) = '' THEN
      NEW.photo_url := NULL;
    ELSE
      v_folder := auth.uid()::text;
      IF v_folder IS NULL OR NEW.id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'photo_url_not_in_own_bucket'
          USING ERRCODE = '23514';
      END IF;

      v_url := regexp_replace(btrim(NEW.photo_url), '[?#].*$', '');
      -- Hôte exact du projet Aypik. Pas de joker : un autre projet Supabase
      -- avec le même chemin de bucket est refusé.
      IF v_url NOT LIKE 'https://dtsyeouinmpjvdgwkncu.supabase.co/storage/v1/%'
         OR substring(
           v_url
           FROM 'https://dtsyeouinmpjvdgwkncu\.supabase\.co/storage/v1/(.*)$'
         ) !~ '^(object/(public|sign)|render/image/public)/profile-photos/.+' THEN
        RAISE EXCEPTION 'photo_url_not_in_own_bucket'
          USING ERRCODE = '23514';
      END IF;

      v_path := substring(v_url FROM '/profile-photos/([^?#]+)');
      IF v_path IS NULL
         OR position('..' IN v_path) > 0
         OR position('\' IN v_path) > 0
         OR position('%2e' IN lower(v_path)) > 0
         OR position('%2f' IN lower(v_path)) > 0
         OR position('%5c' IN lower(v_path)) > 0
         OR lower(split_part(v_path, '/', 1)) IS DISTINCT FROM lower(v_folder)
         OR split_part(v_path, '/', 2) = '' THEN
        RAISE EXCEPTION 'photo_url_not_in_own_bucket'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF NEW.last_active_at IS DISTINCT FROM OLD.last_active_at THEN
    NEW.last_active_at := now();
  END IF;

  IF NEW.lat IS DISTINCT FROM OLD.lat OR NEW.lng IS DISTINCT FROM OLD.lng THEN
    IF (NEW.lat IS NULL) <> (NEW.lng IS NULL) THEN
      RAISE EXCEPTION 'profile_coordinates_out_of_range'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.lat IS NOT NULL THEN
      IF NEW.lat::text IN ('NaN', 'Infinity', '-Infinity')
         OR NEW.lng::text IN ('NaN', 'Infinity', '-Infinity')
         OR NEW.lat < -90 OR NEW.lat > 90
         OR NEW.lng < -180 OR NEW.lng > 180 THEN
        RAISE EXCEPTION 'profile_coordinates_out_of_range'
          USING ERRCODE = '23514';
      END IF;
      NEW.lat := round(NEW.lat::numeric, 2)::double precision;
      NEW.lng := round(NEW.lng::numeric, 2)::double precision;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_enforce_client_update ON public.profiles;
CREATE TRIGGER profiles_enforce_client_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_client_update();

REVOKE ALL ON FUNCTION public.is_open_messaging_profile(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.is_open_messaging_profile(uuid) IS
  'Vrai si ce membre accepte les messages sans Match. Réservé au serveur : suggest_profiles_core et insert_chat_message. Le site lit open_messaging déjà renvoyé par Découvrir.';

NOTIFY pgrst, 'reload schema';
