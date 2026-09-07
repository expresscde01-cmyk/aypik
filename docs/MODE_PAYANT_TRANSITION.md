# Mémo — passage en mode payant : ce qu'il ne faut pas perdre de vue

*Rédigé le 2026-09-07, suite à l'audit base + l'investigation d'un merge Git bloqué sur
`cursor/require-signup-offer-26c5`. À relire avant toute décision d'activer le mode payant.
Voir aussi `docs/PAYMENTS.md` pour la configuration technique Stripe/PayPal elle-même — ce
mémo couvre l'état des branches et ce qu'il reste à faire, pas l'intégration en tant que telle.*

## Le point essentiel : le mode payant n'est PAS otage du merge bloqué

Une branche `cursor/require-signup-offer-26c5` (locale et sur `origin`) est restée en plein
milieu d'un merge `main → cursor/require-signup-offer-26c5` depuis longtemps, avec 14 fichiers
encore en conflit non résolu (dont `.env.example`, `PaymentCheckoutModal.tsx`,
`MembershipPanel.tsx`). Ça ressemble à un problème de paiement à première vue — **ça n'en est
pas un**. Le vrai mécanisme de bascule vers le mode payant est ailleurs :

- Le flag `SITE_FREE_MODE` (`src/lib/founderCopy.ts`) contrôle tout : `true` = mode gratuit,
  `false` = checkout Stripe/PayPal actif. Il vit dans `main`, pas dans la branche bloquée.
- Une branche dédiée **`mode-payant`** existe déjà sur `origin`, avec exactement la même
  architecture que `main` (même fichiers, même garde-fou), plus un seul commit :
  `b326b1b — Enable paid mode (SITE_FREE_MODE false) for Stripe/PayPal checkout` (13 août 2026).
- Le site en production est déployé **uniquement depuis `main`**, via `deploy-latest.ps1`
  (`checkout main → pull → build → zip → cPanel`). Ce script refuse même de tourner si le repo
  a des modifications non commitées. Donc le merge bloqué ne peut pas être publié par accident.

## Ce qu'il reste concrètement à faire pour activer le mode payant

Au 2026-09-07, `mode-payant` est **32 commits derrière `main`** (elle date du 13 août, `main` a
continué d'évoluer depuis — corrections, RLS/index d'aujourd'hui, etc.). Checklist avant
d'activer :

- [ ] Fusionner `main` (à jour du jour J) dans `mode-payant` pour rattraper les 32+ commits
      d'écart. Ce merge-là devrait être propre (même structure de fichiers que `main`), à
      vérifier quand même — pas de raison de le supposer sans le tester.
- [ ] Tester `mode-payant` en local (`npm run dev` sur cette branche) avec des clés Stripe/PayPal
      de test avant toute mise en prod : vérifier le flux Premium et le flux Boost.
- [ ] Vérifier que les vraies valeurs (clés Stripe live, `STRIPE_WEBHOOK_SECRET`,
      `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`) sont configurées côté serveur/CI — pas
      seulement documentées dans `.env.example`.
- [ ] Une fois validé, fusionner `mode-payant` (ou juste le changement du flag + les rattrapages)
      dans `main`, puisque c'est la seule branche que `deploy-latest.ps1` publie.
- [ ] Relire `docs/PAYMENTS.md` pour la partie configuration Stripe/PayPal proprement dite.

## Le sujet en suspens : les 65 commits orphelins de `cursor/require-signup-offer-26c5`

En creusant pourquoi le merge bloqué avait autant de conflits, on a trouvé que cette branche
contient **65 commits jamais fusionnés dans `main`**, avec plus de 1100 lignes de travail :

- L'intégration Stripe/PayPal *d'origine* (`ef8dd99 — Integrate Stripe and PayPal checkout for
  Premium and Boost`), avant que `main` ne la réimplémente à sa façon.
- Tout un écran de choix d'offre à l'inscription (Freemium / Founder / Premium / Boost) avec
  hiérarchie visuelle, copy, et règles (« exiger une offre avant de créer le profil »).
- Des règles de tunnel d'inscription : garder le formulaire rempli en navigant en arrière, ne
  pas perdre les données de brouillon, CTA de fin de tunnel.
- Du travail de copy/polish sur `MembershipPanel.tsx`, `BoostPurchaseCard.tsx`,
  `PremiumConversionCard.tsx`.

**Décision non tranchée à ce jour** : est-ce que ce travail a été intentionnellement abandonné
quand le site est passé en mode gratuit (`a125983 — Ship launch nonprofit mode...`), ou est-ce
qu'il y a dedans des éléments d'UX pour l'écran d'offre payante qu'on voudra récupérer avant
d'activer le mode payant pour de vrai ? À trancher **avant** le jour J, pas après, parce que
l'écran de choix d'offre (Freemium/Founder/Premium/Boost) fait justement partie de ce qui
manque probablement côté mode payant actuel.

Tant que ce n'est pas tranché : ne pas supprimer la branche `cursor/require-signup-offer-26c5`
ni forcer un `git merge --abort` qui ferait disparaître ces 65 commits de l'historique local
sans y avoir rejeté un oeil.

## Important : deux dossiers locaux existent sur ce poste

Ce mémo a été écrit initialement dans `C:\Users\expre\aypik`, un **clone local séparé et
obsolète** du même dépôt — pas le dossier de travail réel. Le vrai dossier, celui utilisé par
Cursor et par `deploy-latest.ps1`, est **`C:\Users\expre\Videos\Site\project`**. Le mémo est
recopié ici pour cette raison. Tout ce qui est dit ci-dessus (branche `mode-payant`, branche
orpheline `cursor/require-signup-offer-26c5`, 65 commits) reste vrai indépendamment du dossier,
puisque ce sont des branches sur `origin`, partagées entre les deux clones. Seule la section
ci-dessous (état du merge bloqué) est spécifique au clone `aypik` et ne concerne pas ce dossier.

## État technique du merge bloqué (pour référence — concerne `C:\Users\expre\aypik`, pas ce dossier)

- Local, sur le poste `desktop-6j9r6k7`, dossier `C:\Users\expre\aypik` (le clone obsolète,
  pas celui-ci).
- Branche courante au moment du blocage : `cursor/require-signup-offer-26c5`.
- `MERGE_HEAD` : `8851d699...` (commit de `main` qu'on essayait de fusionner).
- 210 fichiers déjà résolus/stagés automatiquement, 14 en conflit réel non résolu, 6 en
  double-ajout (`AA`) à vérifier aussi.
- **Résolu depuis** : merge annulé (`git reset --hard` + `checkout main`), dossier `aypik`
  revenu propre sur `main`. Les 65 commits de la branche orpheline sont intacts (vérifié :
  `cursor/require-signup-offer-26c5` local = `origin/cursor/require-signup-offer-26c5` =
  `d16d906...`).
- Sans impact sur le site en ligne ni sur la base Supabase (systèmes indépendants) — ce
  clone `aypik` n'est de toute façon pas celui utilisé au quotidien.
