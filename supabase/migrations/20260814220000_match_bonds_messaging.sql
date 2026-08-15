-- Match explicite + messagerie : un Flash accepté OU des likes croisés
-- créent un lien unique, identique pour les deux profils.
-- users_are_matched ne dépend plus uniquement des likes bidirectionnels
-- (ce qui provoquait RAISE not_matched pour l’émetteur du Flash).

CREATE TABLE IF NOT EXISTS public.match_bonds (
  user_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  origin text NOT NULL DEFAULT 'like' CHECK (origin IN ('like', 'flash')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CONSTRAINT match_bonds_ordered CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS idx_match_bonds_user_b ON public.match_bonds(user_b);

ALTER TABLE public.match_bonds ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.match_bonds TO authenticated;

DROP POLICY IF EXISTS "match_bonds_select_participants" ON public.match_bonds;
CREATE POLICY "match_bonds_select_participants"
ON public.match_bonds FOR SELECT
TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE OR REPLACE FUNCTION public.ensure_match_bond(u1 uuid, u2 uuid, p_origin text DEFAULT 'like')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a uuid;
  b uuid;
  origin_val text := CASE WHEN p_origin = 'flash' THEN 'flash' ELSE 'like' END;
BEGIN
  IF u1 IS NULL OR u2 IS NULL OR u1 = u2 THEN
    RETURN;
  END IF;
  a := LEAST(u1, u2);
  b := GREATEST(u1, u2);
  INSERT INTO public.match_bonds (user_a, user_b, origin)
  VALUES (a, b, origin_val)
  ON CONFLICT (user_a, user_b) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_match_bond(uuid, uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.pair_has_interest(from_id uuid, to_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    from_id IS DISTINCT FROM to_id
    AND (
      EXISTS (
        SELECT 1 FROM public.likes
        WHERE from_user = from_id AND to_user = to_id
      )
      OR EXISTS (
        SELECT 1 FROM public.flashes
        WHERE from_user = from_id AND to_user = to_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.pair_has_interest(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pair_has_interest(uuid, uuid) TO authenticated;

-- Plus d’âge ici : un échec d’âge ne doit plus être renvoyé comme not_matched.
CREATE OR REPLACE FUNCTION public.users_are_matched(u1 uuid, u2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u1 IS DISTINCT FROM u2
    AND (
      EXISTS (
        SELECT 1
        FROM public.match_bonds mb
        WHERE mb.user_a = LEAST(u1, u2)
          AND mb.user_b = GREATEST(u1, u2)
      )
      OR (
        public.pair_has_interest(u1, u2)
        AND public.pair_has_interest(u2, u1)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.users_are_matched(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.users_are_matched(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  a uuid;
  b uuid;
  conv_id uuid;
  my_birth date;
  their_birth date;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF other_user IS NULL OR other_user = me THEN
    RAISE EXCEPTION 'invalid_participant';
  END IF;

  SELECT birth_date INTO my_birth FROM profiles WHERE id = me;
  SELECT birth_date INTO their_birth FROM profiles WHERE id = other_user;

  IF my_birth IS NULL OR their_birth IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF NOT public.dating_partner_old_enough(my_birth, their_birth)
     OR NOT public.dating_partner_old_enough(their_birth, my_birth) THEN
    RAISE EXCEPTION 'age_rule_violation';
  END IF;

  IF NOT public.users_are_matched(me, other_user) THEN
    RAISE EXCEPTION 'not_matched';
  END IF;

  PERFORM public.ensure_match_bond(
    me,
    other_user,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM flashes
        WHERE (from_user = me AND to_user = other_user)
           OR (from_user = other_user AND to_user = me)
      ) THEN 'flash'
      ELSE 'like'
    END
  );

  a := LEAST(me, other_user);
  b := GREATEST(me, other_user);

  SELECT id INTO conv_id
  FROM conversations
  WHERE user_a = a AND user_b = b;

  IF conv_id IS NOT NULL THEN
    RETURN conv_id;
  END IF;

  INSERT INTO conversations (user_a, user_b)
  VALUES (a, b)
  ON CONFLICT (user_a, user_b) DO NOTHING;

  SELECT id INTO conv_id
  FROM conversations
  WHERE user_a = a AND user_b = b;

  RETURN conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION notify_on_mutual_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
  target_name text;
  had_like boolean := false;
  flash_row_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO actor_name
  FROM profiles
  WHERE id = NEW.from_user;

  SELECT EXISTS (
    SELECT 1 FROM likes
    WHERE from_user = NEW.to_user AND to_user = NEW.from_user
  ) INTO had_like;

  SELECT f.id INTO flash_row_id
  FROM flashes f
  WHERE f.from_user = NEW.to_user AND f.to_user = NEW.from_user
  LIMIT 1;

  IF NOT had_like AND flash_row_id IS NULL THEN
    INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
    VALUES (
      NEW.to_user,
      'like_received',
      'Nouveau Like',
      actor_name || ' t''a envoyé un Like ❤️',
      NEW.from_user
    );
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu’un')
  INTO target_name
  FROM profiles
  WHERE id = NEW.to_user;

  PERFORM public.ensure_match_bond(
    NEW.from_user,
    NEW.to_user,
    CASE WHEN flash_row_id IS NOT NULL THEN 'flash' ELSE 'like' END
  );

  INSERT INTO social_notifications (
    user_id, kind, title, body, actor_id, flash_id
  )
  VALUES (
    NEW.to_user,
    'match_created',
    'C’est un match !',
    CASE
      WHEN flash_row_id IS NOT NULL THEN actor_name || ' a matché ton Flash ⚡'
      ELSE actor_name || ' a matché ton Like ❤️'
    END,
    NEW.from_user,
    flash_row_id
  );

  INSERT INTO social_notifications (user_id, kind, title, body, actor_id)
  VALUES (
    NEW.from_user,
    'match_created',
    'C’est un match !',
    target_name || ' a matché.',
    NEW.to_user
  );

  IF flash_row_id IS NOT NULL AND NOT had_like THEN
    INSERT INTO likes (from_user, to_user)
    VALUES (NEW.to_user, NEW.from_user)
    ON CONFLICT (from_user, to_user) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION notify_on_mutual_like() FROM PUBLIC;

-- Rattrapage des Flash déjà acceptés (like en retour sans like de l’émetteur).
ALTER TABLE likes DISABLE TRIGGER likes_notify_on_match;

INSERT INTO likes (from_user, to_user)
SELECT f.from_user, f.to_user
FROM flashes f
WHERE EXISTS (
  SELECT 1 FROM likes l
  WHERE l.from_user = f.to_user AND l.to_user = f.from_user
)
AND NOT EXISTS (
  SELECT 1 FROM likes l
  WHERE l.from_user = f.from_user AND l.to_user = f.to_user
)
ON CONFLICT (from_user, to_user) DO NOTHING;

ALTER TABLE likes ENABLE TRIGGER likes_notify_on_match;

INSERT INTO public.match_bonds (user_a, user_b, origin)
SELECT LEAST(l1.from_user, l1.to_user), GREATEST(l1.from_user, l1.to_user), 'like'
FROM likes l1
JOIN likes l2
  ON l1.from_user = l2.to_user
 AND l1.to_user = l2.from_user
 AND l1.from_user < l1.to_user
ON CONFLICT (user_a, user_b) DO NOTHING;

INSERT INTO public.match_bonds (user_a, user_b, origin)
SELECT LEAST(f.from_user, f.to_user), GREATEST(f.from_user, f.to_user), 'flash'
FROM flashes f
WHERE EXISTS (
  SELECT 1 FROM likes l
  WHERE l.from_user = f.to_user AND l.to_user = f.from_user
)
ON CONFLICT (user_a, user_b) DO NOTHING;

NOTIFY pgrst, 'reload schema';
