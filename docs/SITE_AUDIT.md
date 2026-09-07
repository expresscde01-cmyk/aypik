# Audit site Aypik (code + perf perçue)

Date : 2026-09-07  
Complément de [`docs/DB_AUDIT.md`](DB_AUDIT.md) (base petite, 0 doublon data, RLS/index déjà corrigés en prod).  
Méthode : **lecture seule**. Aucune modification de code dans cette phase.

Périmètre exclu (non touché, non proposé en suppression) : `login-security`, e-mail hook partagé, migrations `*login_security*`, Stripe / PayPal / Premium / Boost (`src/lib/payments.ts`, `src/components/membership/*`, Edge paiement).

---

## Statut

| Sujet | Constat |
| ----- | ------- |
| Composants `src/components/` orphelins | **Aucun** — tous importés |
| Lib jamais appelée (fichier / export) | Quelques exports morts, 1 module e-mail client déprécié |
| Perf perçue | Pas le volume SQL. **Allers-retours répétés** (cloche Realtime, likes/flashes rechargés partout) + **gros JS eager** (CGU, Profil) |
| Pagination likes/messages | Utile plus tard ; **aujourd’hui** le bon levier est cache + debounce, pas un LIMIT cosmétique |

---

## 1. Code mort / dupliqué

### 1.1 Composants

53 fichiers sous `src/components/`. Tous sont importés (y compris `PhoneVerification`, `RestoreLinkButton`, `ChatBubbleButton`, `MatcherWord`, `UnreadBadge`).

Les composants `membership/*` sont **hors nettoyage** (même en `SITE_FREE_MODE`).

### 1.2 Exports / fichiers `src/lib/` jamais appelés

Vérifié par recherche globale (définition seulement, aucun import ailleurs) :

| Élément | Verdict |
| ------- | ------- |
| [`src/lib/suggestions.ts`](../src/lib/suggestions.ts) `fetchPeersWithMessages` (limite 800) | Mort. Le live utilise `fetchPeersWithTwoWayDialogue` / `fetchPeersWhoWroteToMe` (2000). |
| [`src/lib/pendingStudy.ts`](../src/lib/pendingStudy.ts) `countPendingStudyProfiles` | Mort, déjà marqué `@deprecated`. |
| [`src/lib/email/sendFlashEmail.ts`](../src/lib/email/sendFlashEmail.ts) | Fichier entier no-op, `@deprecated`, **zéro import**. Envoi = serveur (`send-social-email`). |
| [`src/lib/founderCopy.ts`](../src/lib/founderCopy.ts) `FOUNDER_AFTER_6_MONTHS_COPY_A` / `_B` / `ARCHIVE` | Inutilisés (`BODY` = copie C). **Ne pas jeter** sans feu vert (copy produit / lancement). |
| [`src/lib/debugPaymentSubscriptions.ts`](../src/lib/debugPaymentSubscriptions.ts) | Uniquement `main.tsx` en DEV. **Hors suppression** (paiement). |

Le reste des modules `src/lib/` a au moins un appelant (hors tests).

### 1.3 Logique dupliquée (équivalent front des RPC réécrites)

Pas de N copies d’une même RPC côté TS, mais **les mêmes SELECT** recopiés :

| Motif | Où | Risque |
| ----- | -- | ------ |
| `likes`/`flashes` `from_user = me` sans limite | `HomeDashboard`, `DiscoveryPage`, `MatchesPage.loadMatches`, `pendingStudy.countInboxCategories` (cloche) | 4 chemins, 0 cache partagé |
| Insert like + lecture du like inverse | `HomeDashboard` et `DiscoveryPage` (presque le même `handleLike`) | Divergence de bugs |
| `suggest_profiles` | `fetchSuggestedProfiles` (Accueil, max 8) et `fetchDiscoveryCatalog` (Découvrir, 500) | OK : deux RPC args, déjà via react-query |
| Geo | `geoProximity.ts` miroir des tables SQL + `geoCommunes.ts` (API gouv) | Volontaire, à garder aligné |
| Archives session | `declinedArchives.ts` / `waitArchives.ts` | Même forme, domaines distincts |

### 1.4 Fichiers orphelins repo

**`COLLER-*.sql` (racine, 33)** — copies « coller dans le SQL Editor », pas appelées par le build. Écart tracking déjà dans DB_AUDIT (§7). Ne pas squash en base.

| À traiter plus tard (feu vert) | Rôle |
| ------------------------------ | ---- |
| `COLLER-TEST-BREAK-MATCH.sql`, `COLLER-TEST-REFUSE-INTEREST.sql` | Tests jetables (ROLLBACK) |
| `COLLER-LOGIN-SECURITY.sql` | **Exclu** |
| Les autres `COLLER-*.sql` | Miroirs de migrations / one-shot RLS — garder tant que le flux collage existe |

**Scripts `scripts/`**

| Fichier | Branché `package.json` ? |
| ------- | ------------------------ |
| `deploy-cpanel.mjs` | oui (`deploy`) |
| `build-app-icon-source.cjs`, `build-app-icons.cjs` | oui (`build:app-icons`) |
| `set-french-recovery-email.mjs` | **non** — outil manuel Auth |
| `cutout-brand-mark.cjs` | **non** — one-shot image |
| `build-favicons.cjs` | **non** — one-shot vs `build:app-icons` |

CI : uniquement [`.github/workflows/protect-login-security.yml`](../.github/workflows/protect-login-security.yml). Aucun de ces scripts n’est dans la CI.

**Autres**

- [`.bolt/`](../.bolt/) — reliquat Bolt (`template: bolt-vite-react-ts`). Jamais importé.
- [`supabase/apply_founder_activation.sql`](../supabase/apply_founder_activation.sql) — dump historique, pas une migration trackée.
- `config.toml` pointe `./seed.sql` **absent** (déjà noté DB_AUDIT).

### 1.5 Dépendances npm

| Package | Usage |
| ------- | ----- |
| `@supabase/supabase-js`, `react`, `react-dom`, `lucide-react`, `@tanstack/react-query` | Oui |
| `@stripe/stripe-js`, `@stripe/react-stripe-js` | Oui, **hors nettoyage** |
| `@paypal/react-paypal-js` | **Aucun import** dans `src/` (PayPal passe par `payments.ts` / SDK, pas ce paquet React) |
| `sharp` | Scripts icônes (devDep) — OK |

Retirer `@paypal/react-paypal-js` = feu vert explicite (voisin paiement).

### 1.6 Variables d’environnement

Lues dans le front :

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — dans `.env.example`
- `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_PAYPAL_CLIENT_ID` — dans `.env.example` (paiement)
- `VITE_TURNSTILE_SITE_KEY` — lue (`AuthScreen`, `ContactPage`, `ChangePasswordSection`, typée dans `vite-env.d.ts`) **mais pas de ligne `VITE_TURNSTILE_SITE_KEY=`** dans [`.env.example`](../.env.example) (seulement un commentaire)

`RESEND_*` dans `.env.example` : secrets serveur, pas le bundle Vite — normal.

---

## 2. Performance perçue

La base ne dépasse pas ~425 lignes : un `SELECT` likes n’est pas le goulot. Ce qui se sent : **trop d’appels d’un coup**, **JS initial**, **refresh cloche**.

### 2.1 Requêtes « tout charger » — correctif réel

| Chemin | Comportement | Correctif proposé (après feu vert) | Risque |
| ------ | ------------- | ----------------------------------- | ------ |
| `MatchesPage.loadMatches` | 4 SELECT likes/flashes sent+received, **sans limite**, à chaque reload | **React Query** partagée `['my-likes-flashes', userId]` (stale 60 s déjà le défaut) plutôt qu’un LIMIT 50 qui casserait Mes Matchs | Faible |
| `countInboxCategories` | Mêmes likes/flashes **encore** à chaque refresh cloche | Lire le même cache, ou RPC unique `inbox_digest` | Moyen (cloche fragile) |
| `HomeDashboard` / `DiscoveryPage` | Encore likes/flashes sent | Même cache | Faible |
| `fetchPeersWithTwoWayDialogue` / `WhoWroteToMe` | jusqu’à **2000** lignes `messages` **à chaque** `refresh()` cloche | RPC `peer_dialogue_flags()` (2 booléens / pair) ou s’appuyer sur `unread_message_counts` + `conversations` | Moyen |
| `fetchPeersWithMessages` (800) | **Mort** | Supprimer le code, ne pas « paginer » | Nul |
| `unreadCountsBySender` fallback table **sans limite** | Seulement si RPC absente | Garder la RPC ; ne pas toucher | — |
| Catalogue Découvrir | déjà plafonné 500 + react-query | Rien d’urgent | — |

**Pagination brute des likes** : mauvais premier pas (l’inbox a besoin de l’historique). Le partage de cache enlève 3/4 des allers-retours **sans changer le métier**.

### 2.2 Bundle JS / code-splitting

Déjà lazy dans [`AppShell.tsx`](../src/components/AppShell.tsx) : `DiscoveryPage`, `MatchesPage` (CSP `strict-dynamic` dans `public/index.php`).

Toujours dans le **premier graphe** (visiteur ou membre) :

| Module | ~poids source | Notes |
| ------ | ------------- | ----- |
| `LegalTerms.tsx` | ~42 Ko / ~1270 lignes | Import **eager** dans `App.tsx` pour CGU + `SiteFooter`/`LegalLink`. Le texte CGU voyage avec Accueil/Auth. **Meilleur candidat lazy** : extraire footer/lien, `lazy()` la page CGU. |
| `ProfileSetup.tsx` | ~57 Ko | Eager dans AppShell (onboarding). Après profil créé, le chunk reste dans le graphe parent. Lazy possible **après** le premier profil, pas avant. |
| `NotificationsBell.tsx` | ~49 Ko | Header : toujours chargé une fois loggé. Ne pas lazy-load la cloche (layout shift). |
| `HomeDashboard.tsx` | Accueil | Eager, normal |
| `LandingPage.tsx` | Landing | Eager, normal |
| `MatchesPage` / `DiscoveryPage` | 106 / 50 Ko | Déjà découpés |

`lucide-react` : imports nommés (tree-shake). Pas de React Router.

### 2.3 Images

| Surface | État |
| ------- | ---- |
| [`ProfilePhoto.tsx`](../src/components/ProfilePhoto.tsx) | `loading="lazy"` par défaut, `decoding=async`, transform Storage `render/image` 400w q=70, fallback URL brute |
| Upload | JPEG/PNG/WebP/GIF/HEIC, max **5 Mo**, pas de recompression client — OK à petit volume ; plus tard compresser avant upload |
| `public/` | PNG icônes PWA + `brand-mark*.png` + `app-icon-source.png` (source, rarement utile en prod) — candidate : ne pas servir `app-icon-source.png` dans le zip si non référencé |

Pas de galerie non lazy hors photos de profil.

### 2.4 Re-renders / Realtime (le vrai « lag » UI)

| Déclencheur | Effet |
| ----------- | ----- |
| Realtime `social_notifications` `event: '*'` | **`refresh()` + `refreshCategoryNotifs()` complets** : sweep RPC + 25 notifs + 2 scans messages 2000 + `countInboxCategories` (likes/flashes/inbox) |
| `UnreadMessagesProvider` | 1 canal messages ; INSERT incrémental ; UPDATE → resync RPC `unread_message_counts` (correct) |
| `ChatScreen` | canal par conversation | OK |
| Accueil `homeQuery` | `useEffect` copie likedIds dans du state local (double rendu) | Cosmétique |
| `StrictMode` | double effet en DEV seulement | Ne pas confondre avec la prod |

Un Flash reçu = une rafale réseau cloche, pas un scan Postgres lourd.

### 2.5 Appels réseau redondants au chargement (membre, onglet Accueil)

Ordre typique, **sans** ouvrir Découvrir/Matchs :

1. Auth + `profiles` (AppShell)
2. `ensure_my_membership` / flags compte
3. `touch_my_presence`
4. Accueil : `suggest_profiles` (8) + likes sent + flashes sent
5. Cloche (header) : sweep + notifs + 2× messages + countInboxCategories (likes sent **et** received + flashes received + inbox_responses)
6. Unread messages RPC
7. Realtime : 2 souscriptions (messages, social_notifications)

Likes « envoyés » sont donc chargés **deux fois** (Accueil + cloche) dès l’arrivée.

---

## 3. Plan de nettoyage priorisé

Aucune de ces actions n’est exécutée ici.

| Prio | Action | Impact ressenti | Risque | Feu vert |
| ---- | ------ | --------------- | ------ | -------- |
| P0 | Rien tant que ce rapport n’est pas validé | — | — | — |
| P1 | Supprimer `fetchPeersWithMessages`, `countPendingStudyProfiles`, `src/lib/email/sendFlashEmail.ts` après 2e grep | Nul | Nul si grep OK | Oui, risque zéro |
| P1b | Ajouter `VITE_TURNSTILE_SITE_KEY=` dans `.env.example` | Doc | Nul | Oui |
| P1c | Retirer `.bolt/` | Repo | Nul | Oui |
| P2 | Lazy de la **page** CGU (garder `LegalLink`/`SiteFooter` légers) | 1er chargement visiteur | Faible (CSP chunks déjà là) | Une PR, test `/` + `?legal=cgu` |
| P3 | Debounce 300–500 ms sur le handler Realtime cloche | Cloche / CPU | Moyen | Test Flash + like + message |
| P4 | Cache react-query unique likes/flashes de session | Accueil + Découvrir + Matchs + cloche | Moyen | Parcourir les 4 écrans |
| P5 | RPC (ou conversations) à la place des scans 2000 messages | Cloche | Moyen | Badge 1er mot / discussion |
| P6 | `COLLER-TEST-*.sql` seulement | Repo | Nul | Demande explicite |
| **Ne pas** | LIMIT sur `loadMatches` | Casserait l’inbox | Élevé | — |
| **Ne pas** | Lazy `NotificationsBell` | Header | Layout | — |
| **Ne pas** | Touch paiement / login-security / `@paypal` sans OK | — | — | — |
| **Ne pas** | Refonte MatchesPage / cloche | — | — | — |
| Plus tard | Compresser photos à l’upload ; retirer `app-icon-source.png` du zip si non lié | Images | Faible | — |

---

## 4. Journal

### 2026-09-07 — Phase 0

| Avant | Action | Après |
| ----- | ------ | ----- |
| Pas d’audit site | Lecture `src/`, `scripts/`, `package.json`, `.env.example`, `COLLER-*.sql` | Ce fichier |
| Code / prod | **aucune** | inchangé |

### 2026-09-07 — Phase 1 (P1–P4, 4 commits)

| Commit | Action |
| ------ | ------ |
| `4c86e35` | P1 — `fetchPeersWithMessages`, `countPendingStudyProfiles`, `sendFlashEmail.ts` |
| `bf2f1fc` | P2 — `LegalChrome` + `lazy(LegalTerms)` |
| `e2c1d81` | P3 — debounce Realtime cloche 400 ms |
| `9e4ef04` | P4 — cache `likeFlashEdges` (pas de LIMIT `loadMatches`, cloche non lazy) |

Hors de ces commits (volontaire) : P1b `.env.example` Turnstile, P1c `.bolt/`, P5, P6, migration RLS, docs.
