-- Retour arrière de 20261108140000_profile_photo_signs.
-- À lancer à la main seulement. supabase db push ne l'applique pas.
-- Retire le chemin <id>/<fichier> : photo_url redevient une URL complète du projet.

DROP FUNCTION IF EXISTS public.prepare_profile_photo_signs(uuid, text[]);

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

NOTIFY pgrst, 'reload schema';
