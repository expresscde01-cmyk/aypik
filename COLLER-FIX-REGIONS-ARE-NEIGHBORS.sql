-- Coller TOUT ce fichier dans Supabase → SQL Editor, puis Run.
-- Rétablit Découvrir et les suggestions Accueil.
--
-- Cause : COLLER-PROFILE-PAUSE.sql a remplacé suggest_profiles par une version
-- qui appelle public.regions_are_neighbors(text, text). Cette fonction n’existait
-- pas en base (l’ancienne suggest_profiles utilisait la table region_neighbors).
-- Rien n’a été supprimé : il faut simplement créer la fonction manquante.

CREATE OR REPLACE FUNCTION public.regions_are_neighbors(p_a text, p_b text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_a IS NOT NULL AND p_b IS NOT NULL AND p_a <> p_b AND EXISTS (
    SELECT 1
    FROM (VALUES
      ('Île-de-France', 'Hauts-de-France'),
      ('Île-de-France', 'Grand Est'),
      ('Île-de-France', 'Bourgogne-Franche-Comté'),
      ('Île-de-France', 'Centre-Val de Loire'),
      ('Île-de-France', 'Normandie'),
      ('Hauts-de-France', 'Île-de-France'),
      ('Hauts-de-France', 'Grand Est'),
      ('Hauts-de-France', 'Normandie'),
      ('Grand Est', 'Hauts-de-France'),
      ('Grand Est', 'Île-de-France'),
      ('Grand Est', 'Bourgogne-Franche-Comté'),
      ('Bourgogne-Franche-Comté', 'Grand Est'),
      ('Bourgogne-Franche-Comté', 'Île-de-France'),
      ('Bourgogne-Franche-Comté', 'Centre-Val de Loire'),
      ('Bourgogne-Franche-Comté', 'Auvergne-Rhône-Alpes'),
      ('Centre-Val de Loire', 'Île-de-France'),
      ('Centre-Val de Loire', 'Normandie'),
      ('Centre-Val de Loire', 'Pays de la Loire'),
      ('Centre-Val de Loire', 'Nouvelle-Aquitaine'),
      ('Centre-Val de Loire', 'Auvergne-Rhône-Alpes'),
      ('Centre-Val de Loire', 'Bourgogne-Franche-Comté'),
      ('Normandie', 'Hauts-de-France'),
      ('Normandie', 'Île-de-France'),
      ('Normandie', 'Centre-Val de Loire'),
      ('Normandie', 'Pays de la Loire'),
      ('Normandie', 'Bretagne'),
      ('Bretagne', 'Normandie'),
      ('Bretagne', 'Pays de la Loire'),
      ('Pays de la Loire', 'Bretagne'),
      ('Pays de la Loire', 'Normandie'),
      ('Pays de la Loire', 'Centre-Val de Loire'),
      ('Pays de la Loire', 'Nouvelle-Aquitaine'),
      ('Nouvelle-Aquitaine', 'Pays de la Loire'),
      ('Nouvelle-Aquitaine', 'Centre-Val de Loire'),
      ('Nouvelle-Aquitaine', 'Auvergne-Rhône-Alpes'),
      ('Nouvelle-Aquitaine', 'Occitanie'),
      ('Occitanie', 'Nouvelle-Aquitaine'),
      ('Occitanie', 'Auvergne-Rhône-Alpes'),
      ('Occitanie', 'Provence-Alpes-Côte d''Azur'),
      ('Auvergne-Rhône-Alpes', 'Centre-Val de Loire'),
      ('Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté'),
      ('Auvergne-Rhône-Alpes', 'Nouvelle-Aquitaine'),
      ('Auvergne-Rhône-Alpes', 'Occitanie'),
      ('Auvergne-Rhône-Alpes', 'Provence-Alpes-Côte d''Azur'),
      ('Provence-Alpes-Côte d''Azur', 'Auvergne-Rhône-Alpes'),
      ('Provence-Alpes-Côte d''Azur', 'Occitanie')
    ) AS n(region, neighbor)
    WHERE n.region = p_a AND n.neighbor = p_b
  );
$$;

REVOKE ALL ON FUNCTION public.regions_are_neighbors(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regions_are_neighbors(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regions_are_neighbors(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
