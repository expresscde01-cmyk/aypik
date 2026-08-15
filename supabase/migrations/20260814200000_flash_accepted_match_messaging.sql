-- Un Flash accepté (like en retour) est un match, des deux côtés.
-- Auparavant users_are_matched n’exigeait que des likes croisés,
-- ce qui bloquait la messagerie pour l’émetteur du Flash.

CREATE OR REPLACE FUNCTION public.users_are_matched(u1 uuid, u2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p1
    JOIN profiles p2 ON p2.id = u2
    WHERE p1.id = u1
      AND u1 <> u2
      AND public.dating_partner_old_enough(p1.birth_date, p2.birth_date)
      AND public.dating_partner_old_enough(p2.birth_date, p1.birth_date)
      AND (
        (
          EXISTS (
            SELECT 1 FROM likes
            WHERE from_user = u1 AND to_user = u2
          )
          AND EXISTS (
            SELECT 1 FROM likes
            WHERE from_user = u2 AND to_user = u1
          )
        )
        OR (
          EXISTS (
            SELECT 1 FROM flashes
            WHERE from_user = u1 AND to_user = u2
          )
          AND EXISTS (
            SELECT 1 FROM likes
            WHERE from_user = u2 AND to_user = u1
          )
        )
        OR (
          EXISTS (
            SELECT 1 FROM flashes
            WHERE from_user = u2 AND to_user = u1
          )
          AND EXISTS (
            SELECT 1 FROM likes
            WHERE from_user = u1 AND to_user = u2
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.users_are_matched(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.users_are_matched(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
