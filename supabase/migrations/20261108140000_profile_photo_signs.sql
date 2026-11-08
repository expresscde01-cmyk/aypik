-- Photos : le site peut enregistrer le chemin <id>/<fichier>,
-- ou encore l'URL complète du projet pendant la transition.
-- prepare_profile_photo_signs filtre les chemins signables et les compte
-- dans le plafond de lecture (5 000 / minute, 25 000 / jour).

CREATE OR REPLACE FUNCTION public.enforce_profile_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_raw text;
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

      v_raw := btrim(NEW.photo_url);
      IF position('://' IN v_raw) = 0 THEN
        IF lower(v_raw) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
           OR position('..' IN v_raw) > 0
           OR position('\' IN v_raw) > 0
           OR position('%2e' IN lower(v_raw)) > 0
           OR position('%2f' IN lower(v_raw)) > 0
           OR position('%5c' IN lower(v_raw)) > 0
           OR lower(split_part(v_raw, '/', 1)) IS DISTINCT FROM lower(v_folder) THEN
          RAISE EXCEPTION 'photo_url_not_in_own_bucket'
            USING ERRCODE = '23514';
        END IF;
        NEW.photo_url := lower(split_part(v_raw, '/', 1)) || '/' || split_part(v_raw, '/', 2);
      ELSE
        v_url := regexp_replace(v_raw, '[?#].*$', '');
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

CREATE OR REPLACE FUNCTION public.prepare_profile_photo_signs(
  p_user_id uuid,
  p_paths text[]
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path text;
  v_norm text;
  v_folder text;
  v_id uuid;
  allowed text[] := ARRAY[]::text[];
  n integer;
  ok boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_paths IS NULL OR cardinality(p_paths) > 100 THEN
    RAISE EXCEPTION 'photo_sign_chunk_too_large' USING ERRCODE = '22023';
  END IF;

  FOREACH v_path IN ARRAY p_paths LOOP
    v_path := btrim(coalesce(v_path, ''));
    IF v_path = ''
       OR lower(v_path) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
       OR position('..' IN v_path) > 0
       OR position('\' IN v_path) > 0
       OR position('%2e' IN lower(v_path)) > 0
       OR position('%2f' IN lower(v_path)) > 0
       OR position('%5c' IN lower(v_path)) > 0 THEN
      CONTINUE;
    END IF;

    v_folder := lower(split_part(v_path, '/', 1));
    v_norm := v_folder || '/' || split_part(v_path, '/', 2);
    IF v_norm = ANY (allowed) THEN
      CONTINUE;
    END IF;

    IF v_folder = lower(p_user_id::text) THEN
      allowed := allowed || v_norm;
      CONTINUE;
    END IF;

    v_id := v_folder::uuid;
    IF EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_id
        AND p.deletion_requested_at IS NULL
        AND p.paused_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.suggestion_refuse_hidden_ids(p_user_id) h
          WHERE h.hidden_id = p.id
        )
    ) THEN
      allowed := allowed || v_norm;
    END IF;
  END LOOP;

  n := cardinality(allowed);
  IF n = 0 THEN
    RETURN allowed;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  ok := public.consume_profile_read(n);
  IF NOT ok THEN
    RETURN NULL;
  END IF;
  RETURN allowed;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_profile_photo_signs(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_profile_photo_signs(uuid, text[])
  TO service_role;

COMMENT ON FUNCTION public.prepare_profile_photo_signs(uuid, text[]) IS
  'Chemins de photos signables pour ce compte : le sien, ou une fiche ni en pause, ni en suppression, ni refusée. NULL si le plafond de lecture est atteint. 100 chemins maximum.';

NOTIFY pgrst, 'reload schema';
