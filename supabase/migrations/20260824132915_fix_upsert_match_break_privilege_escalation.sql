
-- Faille : upsert_match_break(p_user, p_peer, p_origin, p_action) n'avait aucune
-- vérification d'identité. N'importe qui pouvait casser ("break") le match de deux
-- autres utilisateurs à leur insu, puisque users_are_matched() exclut les paires avec
-- une ligne match_breaks(action='break'). Corrigé : seul l'utilisateur concerné
-- (p_user = auth.uid()) peut créer/modifier sa propre ligne de rupture.
CREATE OR REPLACE FUNCTION public.upsert_match_break(p_user uuid, p_peer uuid, p_origin text, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.match_breaks (user_id, peer_id, origin, action)
  VALUES (p_user, p_peer, p_origin, p_action)
  ON CONFLICT (user_id, peer_id) DO UPDATE
  SET
    origin = EXCLUDED.origin,
    action = EXCLUDED.action,
    created_at = now();
END;
$function$;

NOTIFY pgrst, 'reload schema';
