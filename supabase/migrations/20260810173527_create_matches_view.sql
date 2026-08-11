/*
# Create matches view (mutual likes)

## Purpose
A view that pairs mutual likes (A likes B AND B likes A) so the app can show
users their matches. Uses a normalized pair (user_a < user_b) to avoid duplicates.

## Notes
- Views in PostgreSQL do not have their own RLS policies; they respect the RLS
  of the underlying likes table. Since likes_select_own already restricts reads
  to likes a user sent or received, the matches view inherits that protection.
*/

DROP VIEW IF EXISTS matches;
CREATE VIEW matches AS
SELECT
  l1.from_user AS user_a,
  l1.to_user   AS user_b,
  l1.created_at AS matched_at
FROM likes l1
JOIN likes l2
  ON l1.from_user = l2.to_user
 AND l1.to_user   = l2.from_user
 AND l1.from_user < l2.from_user;
