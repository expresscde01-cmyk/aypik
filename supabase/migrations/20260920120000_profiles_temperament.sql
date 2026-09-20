-- Tempérament : pastilles connues uniquement, 5 max, sans doublon.
-- NULL = étape d’inscription pas encore vue. {} = passé / aucun choix.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS temperament text[];

UPDATE public.profiles
SET temperament = '{}'::text[]
WHERE temperament IS NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_temperament_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_temperament_len
  CHECK (
    temperament IS NULL
    OR cardinality(temperament) <= 5
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_temperament_keys;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_temperament_keys
  CHECK (
    temperament IS NULL
    OR temperament <@ ARRAY[
      'calm',
      'settled',
      'dynamic',
      'hyper',
      'homebody',
      'introvert',
      'sociable',
      'extrovert',
      'needs_company',
      'discreet',
      'listener',
      'communicative',
      'talkative',
      'distant',
      'empathic',
      'sensitive',
      'tender',
      'warm',
      'romantic',
      'rational',
      'thinker',
      'curious',
      'creative',
      'funny',
      'organized',
      'mature',
      'spontaneous',
      'adventurous',
      'carefree'
    ]::text[]
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_temperament_unique;

CREATE OR REPLACE FUNCTION public.temperament_keys_unique(keys text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    keys IS NULL
    OR COALESCE(cardinality(keys), 0) = (
      SELECT COUNT(DISTINCT k) FROM unnest(keys) AS k
    );
$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_temperament_unique
  CHECK (public.temperament_keys_unique(temperament));

COMMENT ON COLUMN public.profiles.temperament IS
  'Clés de tempérament (max 5). NULL = pas encore demandé à l’inscription ; {} = aucun choix. Effacé avec le profil (RGPD).';

GRANT SELECT, UPDATE (temperament) ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
