-- Tempérament : plafond 5 → 6. Données inchangées.
-- profiles_temperament_unique / temperament_keys_unique : unicité seulement
-- (pas de limite de longueur). La limite d’effectif est profiles_temperament_len.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_temperament_len;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_temperament_len
  CHECK (
    temperament IS NULL
    OR cardinality(temperament) <= 6
  );

COMMENT ON COLUMN public.profiles.temperament IS
  'Clés de tempérament (max 6). NULL = pas encore demandé à l’inscription ; {} = aucun choix. Effacé avec le profil (RGPD).';

NOTIFY pgrst, 'reload schema';
