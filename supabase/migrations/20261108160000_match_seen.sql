-- Un match vu est enregistré pour le membre, pas dans le navigateur.
-- Les matchs formés avant le jour courant (Paris) sont déjà vus.
-- Le navigateur ne peut pas écrire la table : seulement mark_matches_seen.

CREATE TABLE public.match_seen (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  peer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, peer_id),
  CONSTRAINT match_seen_not_self CHECK (user_id <> peer_id)
);

ALTER TABLE public.match_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.match_seen FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.match_seen TO authenticated;

DROP POLICY IF EXISTS match_seen_select_own ON public.match_seen;
CREATE POLICY match_seen_select_own
ON public.match_seen
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE FUNCTION public.mark_matches_seen(p_peer_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_peer_ids IS NULL OR cardinality(p_peer_ids) = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.match_seen (user_id, peer_id)
  SELECT uid, peer
  FROM unnest(p_peer_ids) AS peer
  WHERE peer IS NOT NULL
    AND peer <> uid
    AND EXISTS (
      SELECT 1
      FROM public.match_bonds mb
      WHERE (mb.user_a = uid AND mb.user_b = peer)
         OR (mb.user_b = uid AND mb.user_a = peer)
    )
  ON CONFLICT (user_id, peer_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_matches_seen(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_matches_seen(uuid[]) TO authenticated;

INSERT INTO public.match_seen (user_id, peer_id)
SELECT mb.user_a, mb.user_b
FROM public.match_bonds mb
WHERE mb.created_at < (
  date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris'
)
UNION
SELECT mb.user_b, mb.user_a
FROM public.match_bonds mb
WHERE mb.created_at < (
  date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris'
)
ON CONFLICT (user_id, peer_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
