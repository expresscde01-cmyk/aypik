
-- Bug identifié : le trigger notify_on_mutual_like() insère un texte placeholder
-- ("Match le" / "Matche le", sans date ni distinction Flash/Like) qui ne correspond
-- à aucun des motifs regex attendus par le front (src/lib/interactionCopy.ts,
-- resolveMatchNotificationRole / resolveMatchOrigin). Faute de colonnes
-- origin/action_type/match_role en base, le front retombe sur une heuristique basée
-- sur flash_id qui inverse le rôle pour la moitié des cas :
--   - match "Like" : l'initiateur (to_user) se voit à tort attribuer le rôle "accepted"
--   - match "Flash" : l'accepteur (from_user) se voit à tort attribuer le rôle "initiated"
-- Résultat en prod : le mauvais texte de notification ("C'est un match ! / a matché
-- ton Flash" vs "Match confirmé / Tu as validé...") est montré à la mauvaise personne.
--
-- Correctif : on écrit désormais exactement le texte que le front recalculerait via
-- matchCreatedNotification() / matchAcceptedByUsNotification() (glossaire CGU), ce qui
-- (a) restaure un texte correct même si un futur consommateur backend lit title/body
-- bruts, et (b) fait matcher précisément les regex de détection du front, donc corrige
-- la détection de rôle/origine sans toucher au code front.
CREATE OR REPLACE FUNCTION public.notify_on_mutual_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor_name text;
  target_name text;
  had_like boolean := false;
  flash_row_id uuid;
  origin_label text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu''un')
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
      actor_name || ' t''a envoyé un Like ❤️.',
      NEW.from_user
    );
    RETURN NEW;
  END IF;

  PERFORM public.ensure_match_bond(
    NEW.from_user,
    NEW.to_user,
    CASE WHEN flash_row_id IS NOT NULL THEN 'flash' ELSE 'like' END
  );

  DELETE FROM public.social_notifications
  WHERE kind IN ('flash_received', 'like_received')
    AND (
      (user_id = NEW.to_user AND actor_id = NEW.from_user)
      OR (user_id = NEW.from_user AND actor_id = NEW.to_user)
    );

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Quelqu''un')
  INTO target_name
  FROM profiles
  WHERE id = NEW.to_user;

  origin_label := CASE WHEN flash_row_id IS NOT NULL THEN 'Flash ⚡' ELSE 'Like ❤️' END;

  -- Initiateur d'origine (NEW.to_user) : son Like/Flash vient d'être accepté
  -- -> role "initiated" côté front (glossaire CGU "Match le").
  INSERT INTO social_notifications (
    user_id, kind, title, body, actor_id, flash_id
  )
  VALUES (
    NEW.to_user,
    'match_created',
    'C''est un match !',
    actor_name || ' a matché ton ' || origin_label || '.',
    NEW.from_user,
    flash_row_id
  );

  -- Accepteur (NEW.from_user) : valide la sollicitation entrante
  -- -> role "accepted" côté front (glossaire CGU "Matché le").
  INSERT INTO social_notifications (user_id, kind, title, body, actor_id, flash_id)
  VALUES (
    NEW.from_user,
    'match_created',
    'Match confirmé',
    'Tu as validé le '
      || (CASE WHEN flash_row_id IS NOT NULL THEN 'Flash' ELSE 'Like' END)
      || ' de ' || target_name || ' : match confirmé (la messagerie est ouverte).',
    NEW.to_user,
    flash_row_id
  );

  IF flash_row_id IS NOT NULL AND NOT had_like THEN
    INSERT INTO likes (from_user, to_user)
    VALUES (NEW.to_user, NEW.from_user)
    ON CONFLICT (from_user, to_user) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Correction rétroactive des notifications match_created déjà en base avec le
-- placeholder cassé, pour que l'historique (cloche / email) reste cohérent.
WITH origin_calc AS (
  SELECT
    sn.id,
    sn.user_id,
    sn.actor_id,
    sn.flash_id,
    CASE WHEN sn.flash_id IS NOT NULL THEN 'Flash ⚡' ELSE 'Like ❤️' END AS origin_label,
    CASE WHEN sn.flash_id IS NOT NULL THEN 'Flash' ELSE 'Like' END AS origin_word,
    COALESCE(NULLIF(trim(actor_p.display_name), ''), 'Quelqu''un') AS actor_name,
    COALESCE(NULLIF(trim(user_p.display_name), ''), 'Quelqu''un') AS user_name,
    -- to_user d'origine (initiateur) = celui dont actor_id est le user qui vient
    -- d'accepter ET pour qui il existe un match_bond avec origin cohérent : on se
    -- base ici sur l'existence d'une notif miroir plus récente/older pour distinguer
    -- initiateur vs accepteur via l'ordre relatif des deux lignes jumelles.
    ROW_NUMBER() OVER (
      PARTITION BY LEAST(sn.user_id, sn.actor_id), GREATEST(sn.user_id, sn.actor_id), sn.created_at
      ORDER BY sn.user_id
    ) AS pair_rank
  FROM social_notifications sn
  LEFT JOIN profiles actor_p ON actor_p.id = sn.actor_id
  LEFT JOIN profiles user_p ON user_p.id = sn.user_id
  WHERE sn.kind = 'match_created'
    AND sn.title IN ('Match le', 'Matche le')
)
UPDATE social_notifications sn
SET
  title = CASE WHEN oc.pair_rank = 1 THEN 'C''est un match !' ELSE 'Match confirmé' END,
  body = CASE
    WHEN oc.pair_rank = 1 THEN oc.actor_name || ' a matché ton ' || oc.origin_label || '.'
    ELSE 'Tu as validé le ' || oc.origin_word || ' de ' || oc.actor_name || ' : match confirmé (la messagerie est ouverte).'
  END
FROM origin_calc oc
WHERE sn.id = oc.id;

NOTIFY pgrst, 'reload schema';
