-- Coller TOUT ce fichier dans Supabase → SQL Editor, puis Run.
-- Découvrir : effectif des inscriptions + scores d’activité (tri Actifs).

CREATE OR REPLACE FUNCTION public.platform_signup_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.profiles
  WHERE deletion_requested_at IS NULL;
$$;

COMMENT ON FUNCTION public.platform_signup_count() IS
  'Nombre de comptes profils actifs (hors suppression demandée).';

REVOKE ALL ON FUNCTION public.platform_signup_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_signup_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.discovery_activity_ranks(p_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  last_active_at timestamptz,
  activity_score integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH wanted AS (
    SELECT DISTINCT id
    FROM unnest(COALESCE(p_ids, ARRAY[]::uuid[])) AS id
  ),
  like_stats AS (
    SELECT l.from_user AS id,
      max(l.created_at) AS last_at,
      count(*) FILTER (WHERE l.created_at > now() - interval '30 days')::integer AS cnt
    FROM public.likes l
    JOIN wanted w ON w.id = l.from_user
    GROUP BY l.from_user
  ),
  flash_stats AS (
    SELECT f.from_user AS id,
      max(f.created_at) AS last_at,
      count(*) FILTER (WHERE f.created_at > now() - interval '30 days')::integer AS cnt
    FROM public.flashes f
    JOIN wanted w ON w.id = f.from_user
    GROUP BY f.from_user
  ),
  msg_stats AS (
    SELECT m.sender_id AS id,
      max(m.created_at) AS last_at,
      count(*) FILTER (WHERE m.created_at > now() - interval '30 days')::integer AS cnt
    FROM public.messages m
    JOIN wanted w ON w.id = m.sender_id
    GROUP BY m.sender_id
  )
  SELECT
    w.id AS user_id,
    GREATEST(
      u.last_sign_in_at,
      p.updated_at,
      p.created_at,
      lk.last_at,
      fl.last_at,
      msg.last_at
    ) AS last_active_at,
    (
      COALESCE(lk.cnt, 0)
      + COALESCE(fl.cnt, 0) * 2
      + COALESCE(msg.cnt, 0)
    )::integer AS activity_score
  FROM wanted w
  LEFT JOIN public.profiles p ON p.id = w.id
  LEFT JOIN auth.users u ON u.id = w.id
  LEFT JOIN like_stats lk ON lk.id = w.id
  LEFT JOIN flash_stats fl ON fl.id = w.id
  LEFT JOIN msg_stats msg ON msg.id = w.id;
$$;

COMMENT ON FUNCTION public.discovery_activity_ranks(uuid[]) IS
  'Dernière activité et score d’implication (likes, flashs, messages 30 j).';

REVOKE ALL ON FUNCTION public.discovery_activity_ranks(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discovery_activity_ranks(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
