-- Langues parlées : jsonb [{code, level}], max 8, sans doublon.
-- NULL = étape d’inscription pas encore vue. [] = passé / aucun choix.
-- preferred_locale reste la langue d’interface, pas la langue parlée.

INSERT INTO public.platform_settings (key, value) VALUES
  (
    'francophone_country_codes',
    '["FR","GP","MQ","GF","RE","YT","PM","BL","MF","NC","PF","WF","BE","CH","LU","MC","CA","HT","BJ","BF","BI","CM","CF","TD","KM","CG","CD","CI","DJ","GA","GN","GQ","MG","ML","NE","RW","SN","SC","TG","VU"]'::jsonb
  )
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS languages jsonb;

UPDATE public.profiles
SET languages = '[]'::jsonb
WHERE languages IS NULL;

-- Pas de DEFAULT : les nouveaux profils restent NULL (étape d’inscription).

CREATE OR REPLACE FUNCTION public.iso6391_codes()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'aa','ab','ae','af','ak','am','an','ar','as','av','ay','az',
    'ba','be','bg','bh','bi','bm','bn','bo','br','bs',
    'ca','ce','ch','co','cr','cs','cu','cv','cy',
    'da','de','dv','dz',
    'ee','el','en','eo','es','et','eu',
    'fa','ff','fi','fj','fo','fr','fy',
    'ga','gd','gl','gn','gu','gv',
    'ha','he','hi','ho','hr','ht','hu','hy','hz',
    'ia','id','ie','ig','ii','ik','io','is','it','iu',
    'ja','jv',
    'ka','kg','ki','kj','kk','kl','km','kn','ko','kr','ks','ku','kv','kw','ky',
    'la','lb','lg','li','ln','lo','lt','lu','lv',
    'mg','mh','mi','mk','ml','mn','mr','ms','mt','my',
    'na','nb','nd','ne','ng','nl','nn','no','nr','nv','ny',
    'oc','oj','om','or','os',
    'pa','pi','pl','ps','pt',
    'qu',
    'rm','rn','ro','ru','rw',
    'sa','sc','sd','se','sg','si','sk','sl','sm','sn','so','sq','sr','ss','st','su','sv','sw',
    'ta','te','tg','th','ti','tk','tl','tn','to','tr','ts','tt','tw','ty',
    'ug','uk','ur','uz',
    've','vi','vo',
    'wa','wo',
    'xh',
    'yi','yo',
    'za','zh','zu'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.spoken_languages_valid(langs jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  n integer;
  elem jsonb;
  code text;
  lvl text;
  seen text[] := ARRAY[]::text[];
BEGIN
  IF langs IS NULL THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(langs) <> 'array' THEN
    RETURN false;
  END IF;
  n := jsonb_array_length(langs);
  IF n > 8 THEN
    RETURN false;
  END IF;
  FOR elem IN SELECT jsonb_array_elements(langs)
  LOOP
    IF jsonb_typeof(elem) <> 'object' THEN
      RETURN false;
    END IF;
    code := lower(btrim(COALESCE(elem->>'code', '')));
    lvl := btrim(COALESCE(elem->>'level', ''));
    IF code = '' OR lvl = '' THEN
      RETURN false;
    END IF;
    IF NOT (code = ANY (public.iso6391_codes())) THEN
      RETURN false;
    END IF;
    IF lvl NOT IN ('beginner', 'intermediate', 'advanced', 'native') THEN
      RETURN false;
    END IF;
    IF code = ANY (seen) THEN
      RETURN false;
    END IF;
    seen := seen || code;
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_languages_valid;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_languages_valid
  CHECK (public.spoken_languages_valid(languages));

COMMENT ON COLUMN public.profiles.languages IS
  'Langues parlées [{code, level}]. NULL = pas encore demandé ; [] = aucun choix. Pas preferred_locale. Effacé avec le profil (RGPD).';

GRANT SELECT (languages), UPDATE (languages)
  ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
