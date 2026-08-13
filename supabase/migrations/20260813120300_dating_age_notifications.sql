-- Hide notifications from actors younger than floor(viewer_age / 2) + 7.

CREATE OR REPLACE FUNCTION get_my_social_notifications(p_limit integer DEFAULT 30)
RETURNS SETOF social_notifications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.*
  FROM social_notifications n
  LEFT JOIN profiles actor ON actor.id = n.actor_id
  JOIN profiles me ON me.id = auth.uid()
  WHERE n.user_id = auth.uid()
    AND (
      n.actor_id IS NULL
      OR public.dating_partner_old_enough(me.birth_date, actor.birth_date)
    )
  ORDER BY n.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 30), 1);
$$;

REVOKE ALL ON FUNCTION get_my_social_notifications(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_social_notifications(integer) TO authenticated;

CREATE OR REPLACE FUNCTION count_unread_social_notifications()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM social_notifications n
  LEFT JOIN profiles actor ON actor.id = n.actor_id
  JOIN profiles me ON me.id = auth.uid()
  WHERE n.user_id = auth.uid()
    AND n.read_at IS NULL
    AND (
      n.actor_id IS NULL
      OR public.dating_partner_old_enough(me.birth_date, actor.birth_date)
    );
$$;

REVOKE ALL ON FUNCTION count_unread_social_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION count_unread_social_notifications() TO authenticated;
