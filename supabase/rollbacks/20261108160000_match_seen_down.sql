-- Retour de 20261108160000_match_seen.
-- Efface les « vu » enregistrés. Le chiffre « Nouveaux matchs » redevient
-- le nombre de matchs encore en « 1er mot ».

DROP FUNCTION IF EXISTS public.mark_matches_seen(uuid[]);
DROP TABLE IF EXISTS public.match_seen;

NOTIFY pgrst, 'reload schema';
