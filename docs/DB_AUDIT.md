# Audit base de données Aypik

Date : 2026-09-07  
Projet : `dtsyeouinmpjvdgwkncu` (PostgreSQL 17 / Supabase)  
Chemin d’audit : lecture seule **MCP** sur la prod (pas le SQL Editor, pas de scripts `COLLER-DB-*`).

---

## Statut

| Sujet | État |
| ----- | ---- |
| Doublons data | Aucun (0 partout) |
| Volume | Petite base (aucune table au-dessus de **425** lignes) — le volume n’explique pas un ralentissement perçu |
| RLS `auth.uid()` initplan | **Corrigé en prod** |
| Index redondants | **Supprimés en prod** |
| Comptes orphelins | Identifiés, **non purgés** (dates à vérifier) |
| Tracking migrations | Écart repo / `schema_migrations` — à documenter, pas à « réparer » en base |
| Notifications `read_at` | Anomalie de **produit/code**, pas un défaut de contrainte SQL |

Hors périmètre : `login-security`, tables/RPC paiement–Premium–Boost–fondateur.

---

## 1. Moteur

- Supabase + PostgreSQL 17
- Front : [`src/lib/supabase.ts`](../src/lib/supabase.ts) (`@supabase/supabase-js`, anon + RLS)
- Pas d’ORM ; métier lourd en RPC `SECURITY DEFINER`
- Variables : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

---

## 2. Inventaire live (résumé)

Base petite : **rien au-dessus de 425 lignes**. Les tailles précises par table ont été relevées via MCP (rapport live). Ce n’est pas un problème de volume ni de dead tuples massifs.

Objets métier : `profiles`, `likes`, `flashes`, `match_bonds`, `match_breaks`, `conversations`, `messages`, `social_notifications`, `inbox_responses`, `declined_archives`, `memberships`, `membership_notifications`, `platform_settings`, `profile_boosts`, `payment_subscriptions`, `testimonials`, `department_regions`, `region_neighbors`, `region_macro_zones`, `email_dispatch_settings`, `login_security` (COUNT only).

Vue `matches` : toujours présente côté schéma, `REVOKE` anon/authenticated, inutilisée par le front. **Pas droppée.**

---

## 3. Doublons

Recherche live : **0** groupe en trop sur

- `likes` / `flashes` (UNIQUE déjà en place)
- `social_notifications` `(user_id, actor_id, kind)`
- `membership_notifications`

Rien à fusionner.

---

## 4. Orphelins — identifiés, pas touchés

| Constat | n | Action |
| ------- | - | ------ |
| `auth.users` sans `profiles` | **17** | Ne pas DELETE |
| Comptes sans `memberships` | **11** | Ne pas DELETE |

Probables inscriptions abandonnées, mais **sans `created_at` / `last_sign_in_at` on ne distingue pas un abandon ancien d’une inscription en cours**.

Prochaine requête MCP (lecture seule, ids + dates uniquement, pas d’e-mails en clair si évitable) :

```sql
SELECT
  u.id,
  u.created_at,
  u.last_sign_in_at,
  u.email_confirmed_at,
  (p.id IS NOT NULL) AS has_profile,
  (m.user_id IS NOT NULL) AS has_membership
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.memberships m ON m.user_id = u.id
WHERE p.id IS NULL OR m.user_id IS NULL
ORDER BY u.created_at;
```

Purge éventuelle seulement après cette datation (ex. `created_at` > 24–48 h et jamais de `last_sign_in_at` / profil). **Cette session n’a pas d’accès MCP prod** : les 17/11 restent en l’état.

---

## 5. Index

Trois index **redondants** (couverts par un composite / UNIQUE) :

| Supprimé | Recouvert par |
| -------- | ------------- |
| `idx_likes_from_user` | `likes_from_created_idx (from_user, created_at)` |
| `idx_flashes_from_user` | `flashes_from_created_idx` |
| `idx_conversations_user_a` | UNIQUE `(user_a, user_b)` |

Appliqué en prod. **Ne pas reproposer.**

---

## 6. RLS

~**34** policies réévaluaient `auth.uid()` **par ligne** (`auth_rls_initplan`). Corrigé en prod (wrap `(select auth.uid())`). **Ne pas reproposer.**

Migration enregistrée dans `schema_migrations` côté Supabase :

`20260907064440_rls_select_auth_uid_wrap_and_drop_redundant_indexes`

**Écart repo** : ce fichier n’est **pas** dans le working tree actuel (`supabase/migrations/` s’arrête aux patches du 6 sept.). La prod l’a déjà. À récupérer depuis la session MCP qui l’a poussé, pas à réécrire à l’aveugle.

---

## 7. Tracking migrations (documenter, ne pas « corriger » en base)

| Côté | n |
| ---- | - |
| Fichiers `supabase/migrations/` (ce dépôt, avant le patch RLS) | ~80–93 |
| Lignes `supabase_migrations.schema_migrations` | **48**, puis **49** après le patch RLS |

Cohérent avec le flux `COLLER-*.sql` collé à la main : le SQL est en base, le **tracking** CLI non. Recoller tout l’historique dans `schema_migrations` casserait plus qu’autre chose. Les 93 fichiers restent l’historique Git ; on n’en squash aucun.

---

## 8. Perf perçue (hors volume)

Après audit live, le levier réel n’était pas les doublons. Le wrap RLS `auth.uid()` est le correctif déjà appliqué.

Le front charge encore large (likes/flashes sans pagination, messages jusqu’à 2000, `suggest_profiles` 500). Ça restera négligeable tant que la base est &lt; quelques milliers de lignes. Pas d’action base supplémentaire en attente.

---

## 9. Notifications : `flash_received` / `like_received` / `match_created` à 100 % `read_at IS NULL`

Ce n’est **pas** une RPC cassée. `mark_social_notification_read` / `mark_all_social_notifications_read` posent `read_at` pour **tous** les `kind`.

C’est le **parcours cloche** qui n’écrit presque jamais `read_at` pour ces trois types, **volontairement** :

Commentaire figé dans [`src/lib/matchesNav.ts`](../src/lib/matchesNav.ts) :

> jamais un Like / `match_created` non lu : ces events restent non lus.

`BELL_RUBRIC_UNREAD_KINDS` s’en sert : `new` = like/flash, `first` = `match_created`. Si on posait `read_at` en visitant Mes Matchs, le digest « À découvrir » / « 1er mot » se viderait (et `get_my_social_notifications` **cache** déjà like/flash dès que `read_at` est non null ; `sweep_stale_social_notifications` **DELETE** like/flash lus ou matchés, et `match_created` dès qu’il y a un message).

| Kind | Affiché comme ligne cloche | Marqué lu | Pourquoi 100 % NULL en table |
| ---- | -------------------------- | --------- | ---------------------------- |
| `flash_received` / `like_received` | Digest « À découvrir » + ligne fusionnée | Clic ligne / « tout lu » seulement. Clic digest recap → `sessionStorage`, pas SQL | La majorité passe par le digest |
| `match_created` | **Jamais** (`isVisibleSocial` → `false`). Sert au digest « 1er mot » | Idem : visite fiche → `clearDigestActor` local, pas `read_at` | Toutes les lignes restantes n’ont pas encore de messages (sinon `sweep` les DELETE) |
| `match_declined` / `message_received` | Ligne cliquable | `handleItemClick` → RPC | Taux de lecture normal |

« Tout marquer lu » (`markAllSocialNotificationsRead`) **écraserait** ces unread et viderait les rubriques. Rarement utilisé, d’où 100 % NULL.

**Verdict :** pas un bug SQL. Produit = badge/digest branchés sur `read_at IS NULL`. Corriger « pour faire propre en base » casserait À découvrir / 1er mot sauf refonte du digest (baseline session uniquement, sans s’appuyer sur `read_at`).

Pas de patch code tant que ce contrat n’est pas changé explicitement.

---

## 10. Journal

### 2026-09-07 — audit MCP + 2 actions faibles risque (prod)

| Avant | Action | Après |
| ----- | ------ | ----- |
| Policies RLS avec `auth.uid()` par ligne | Wrap `(select auth.uid())` | ~34 policies corrigées |
| 3 index redondants | `DROP INDEX` | `idx_likes_from_user`, `idx_flashes_from_user`, `idx_conversations_user_a` absents |
| `schema_migrations` 48 | Enregistrement du patch | 49 |
| 17 users sans profil, 11 sans membership | **aucune** | inchangé |
| Vue `matches` | **aucune** | inchangée |

### 2026-09-07 — ce working tree

- [`docs/DB_AUDIT.md`](DB_AUDIT.md) aligné sur l’audit live (plus de colonnes `*live*` en attente).
- Scripts `COLLER-DB-AUDIT.sql` / `COLLER-DB-CLEAN-PREVIEW.sql` **retirés** (chemin SQL Editor abandonné).
- Migration `20260907064440_…` : **en prod**, absente de ce dossier — à rapatrier, pas à réécrire.

---

## 11. Reste à faire

1. **MCP lecture** : datation des 17+11 comptes orphelins (requête §4). Purge seulement après.
2. **Notifications** : rien en base. Changer le contrat digest seulement si produit le demande.
3. Rapatrier le fichier SQL `20260907064440_rls_select_auth_uid_wrap_and_drop_redundant_indexes.sql` dans Git pour coller au tracking prod.
4. Rien d’autre en attente côté base.
