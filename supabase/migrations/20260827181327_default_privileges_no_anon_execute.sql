-- Garde-fou pour l'avenir : par défaut sur ce projet, toute nouvelle fonction créée
-- dans le schéma public devenait automatiquement exécutable par le rôle anon
-- (utilisateur non authentifié), ce qui a permis la faille corrigée dans la
-- migration précédente (fix_anon_execute_grants_social_functions). On change ce
-- défaut : désormais, une nouvelle fonction n'est PLUS exécutable par anon tant
-- qu'un GRANT EXECUTE explicite n'est pas ajouté. N'affecte pas les fonctions
-- déjà existantes (déjà traitées au cas par cas).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
