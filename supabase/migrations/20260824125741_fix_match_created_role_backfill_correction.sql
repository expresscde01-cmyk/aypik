
-- Correction du correctif précédent (fix_match_created_notification_role_text) :
-- le backfill rétroactif utilisait un ROW_NUMBER() ordonné par user_id (arbitraire,
-- sans rapport avec le rôle réel initiateur/accepteur), ce qui a inversé le rôle
-- pour environ la moitié des paires historiques. On recalcule ici le VRAI rôle
-- initiateur à partir de la source de vérité :
--   - match né d'un Flash : flashes.from_user = initiateur
--   - match né d'un Like  : le like le plus ancien entre les deux users = initiateur
-- puis on réécrit title/body en conséquence pour TOUTES les notifications
-- match_created (le nom affiché, basé sur actor_id, était déjà correct et n'est
-- pas modifié).
WITH truth AS (
  SELECT
    sn.id,
    sn.user_id,
    sn.flash_id,
    COALESCE(NULLIF(trim(actor_p.display_name), ''), 'Quelqu''un') AS actor_name,
    CASE
      WHEN sn.flash_id IS NOT NULL THEN
        (SELECT f.from_user FROM flashes f WHERE f.id = sn.flash_id)
      ELSE (
        SELECT l.from_user
        FROM likes l
        WHERE (l.from_user = sn.user_id AND l.to_user = sn.actor_id)
           OR (l.from_user = sn.actor_id AND l.to_user = sn.user_id)
        ORDER BY l.created_at ASC
        LIMIT 1
      )
    END AS true_initiator
  FROM social_notifications sn
  LEFT JOIN profiles actor_p ON actor_p.id = sn.actor_id
  WHERE sn.kind = 'match_created'
)
UPDATE social_notifications sn
SET
  title = CASE WHEN t.true_initiator = t.user_id THEN 'C''est un match !' ELSE 'Match confirmé' END,
  body = CASE
    WHEN t.true_initiator = t.user_id THEN
      t.actor_name || ' a matché ton ' || (CASE WHEN t.flash_id IS NOT NULL THEN 'Flash ⚡' ELSE 'Like ❤️' END) || '.'
    ELSE
      'Tu as validé le ' || (CASE WHEN t.flash_id IS NOT NULL THEN 'Flash' ELSE 'Like' END)
        || ' de ' || t.actor_name || ' : match confirmé (la messagerie est ouverte).'
  END
FROM truth t
WHERE sn.id = t.id
  AND t.true_initiator IS NOT NULL;

NOTIFY pgrst, 'reload schema';
