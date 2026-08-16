-- Archives « Pas cette fois » : conserver une fiche mauve en bas de Tes Matchs
-- après choix dans la cloche (supprimer définitivement OU archiver).

CREATE TABLE IF NOT EXISTS public.declined_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  origin text NOT NULL CHECK (origin IN ('flash', 'like')),
  declined_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT declined_archives_pair_unique UNIQUE (user_id, actor_id),
  CONSTRAINT declined_archives_not_self CHECK (user_id <> actor_id)
);

CREATE INDEX IF NOT EXISTS declined_archives_user_archived_idx
  ON public.declined_archives (user_id, archived_at DESC);

ALTER TABLE public.declined_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "declined_archives_select_own" ON public.declined_archives;
CREATE POLICY "declined_archives_select_own"
ON public.declined_archives FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "declined_archives_delete_own" ON public.declined_archives;
CREATE POLICY "declined_archives_delete_own"
ON public.declined_archives FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT, DELETE ON public.declined_archives TO authenticated;

CREATE OR REPLACE FUNCTION public.dismiss_declined_notification(
  p_id uuid,
  p_archive boolean,
  p_origin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  n public.social_notifications%ROWTYPE;
  v_origin text;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_id');
  END IF;

  SELECT * INTO n
  FROM public.social_notifications
  WHERE id = p_id
    AND user_id = me
    AND kind = 'match_declined';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_origin := CASE
    WHEN coalesce(p_origin, '') IN ('flash', 'like') THEN p_origin
    WHEN n.body ~* 'flash' THEN 'flash'
    ELSE 'like'
  END;

  IF p_archive AND n.actor_id IS NOT NULL AND n.actor_id <> me THEN
    INSERT INTO public.declined_archives (
      user_id, actor_id, origin, declined_at
    ) VALUES (
      me, n.actor_id, v_origin, n.created_at
    )
    ON CONFLICT (user_id, actor_id) DO UPDATE
    SET
      origin = EXCLUDED.origin,
      declined_at = EXCLUDED.declined_at,
      archived_at = now();
  END IF;

  DELETE FROM public.social_notifications
  WHERE id = n.id
    AND user_id = me;

  RETURN jsonb_build_object(
    'ok', true,
    'archived', p_archive AND n.actor_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_declined_notification(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_declined_notification(uuid, boolean, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
