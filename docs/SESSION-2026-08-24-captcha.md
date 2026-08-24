# Résumé de session — CAPTCHA + sécurité connexion (2026-08-24)

Mémo de secours, au cas où une future conversation ne serait pas la
continuation de celle-ci. Écrit pour qu'une lecture rapide suffise à
comprendre ce qui a été fait, pourquoi, et ce qui reste éventuellement à
faire.

## Objectif de départ

Ajouter Cloudflare Turnstile (CAPTCHA gratuit) en couche supplémentaire
au-dessus du verrouillage de compte existant (blocage après 4 échecs de mot
de passe), pour réduire le risque qu'un attaquant verrouille des comptes à
distance en spammant des tentatives de connexion.

## 1. Mise en place du CAPTCHA

- Nouveau composant `src/components/Turnstile.tsx` : charge le script
  Cloudflare, rend le widget, expose `reset()` via ref (les tokens sont à
  usage unique).
- `src/components/AuthScreen.tsx` (inscription/connexion) et
  `src/components/ChangePasswordSection.tsx` (changement de mot de passe
  depuis le profil, qui revérifie l'ancien mot de passe) : ajout du widget,
  du state `captchaToken`, et passage de `captchaToken` aux appels
  `supabase.auth.signUp / signInWithPassword`.
- `src/lib/loginSecurity.ts` : `sendPasswordResetEmail(email, captchaToken?)`
  passe désormais le token à `resetPasswordForEmail`.
- `public/.htaccess` : CSP mise à jour, `https://challenges.cloudflare.com`
  ajouté à `script-src` et `frame-src` (sinon le widget est bloqué
  silencieusement par le navigateur).
- `.env` (PC utilisateur, jamais committé) : `VITE_TURNSTILE_SITE_KEY`
  ajoutée ; `src/vite-env.d.ts` mis à jour en conséquence.
- Sitekey Cloudflare : `0x4AAAAAAEaOcRg41u71GeHT`. La Secret key (privée)
  n'a jamais transité par cette conversation — collée directement par
  l'utilisateur dans Supabase Dashboard.
- **Activé côté serveur** : Supabase Dashboard → Authentication → Attack
  Protection → CAPTCHA (Turnstile) → Secret key renseignée → Save. Fait
  **après** confirmation que le nouveau frontend était en ligne et
  fonctionnel (ordre important : l'activer avant aurait bloqué tout le
  monde, y compris le développeur).

## 2. Bug découvert et corrigé : connexion silencieusement bloquée

Après mise en ligne, la connexion ne faisait plus rien (aucune erreur,
aucune action) alors que le CAPTCHA affichait "Succès !". Diagnostic via
Console/Réseau du navigateur (Firefox) :

```
Uncaught (in promise) Error: Acquiring an exclusive Navigator LockManager
lock "lock:sb-dtsyeouinmpjvdgwkncu-auth-token" immediately failed
```

Cause : supabase-js sérialise ses appels d'auth via l'API navigateur
Navigator LockManager ; sur ce navigateur (protections anti-tracking
renforcées), l'acquisition du verrou échouait toujours, bloquant
indéfiniment `signInWithPassword()` sans erreur visible. Sans rapport avec
le CAPTCHA.

**Correctif** (`src/lib/supabase.ts`) : passage d'un `lock` no-op dans les
options `auth` de `createClient`, contournement documenté par Supabase
([supabase-js#1594](https://github.com/supabase/supabase-js/issues/1594)).

Les fausses pistes explorées avant de trouver la vraie cause (jeton CAPTCHA
expiré pendant le diagnostic, onglets multiples) n'étaient pas le problème —
seul ce correctif l'a réglé.

## 3. Validation

Les 4 parcours retestés avec le CAPTCHA réellement exigé côté serveur, tous
OK : connexion, inscription, mot de passe oublié, changement de mot de passe
(profil). Le blocage après 4 échecs fonctionne toujours en parallèle du
CAPTCHA.

Petit ajustement cosmétique fait sur `ChangePasswordSection.tsx` : le bouton
reste grisé après un enregistrement réussi tant que les champs n'ont pas été
retouchés (évitait un bouton visuellement "prêt à re-cliquer" juste après le
message de succès).

## 4. Faille résiduelle identifiée et traitée (voir `SECURITY-NOTES.md`)

En vérifiant si le hook natif Supabase "Password Verification Attempt"
pouvait remplacer la logique actuelle : confirmé **indisponible sur le plan
Free et Pro** (réservé à Team, 599 $/mois, cf.
[supabase.com/pricing](https://supabase.com/pricing)) — pas une option
réaliste pour l'instant.

En creusant, faille trouvée : la RPC `record_login_failure` reste appelable
avec la clé publique `anon` sans qu'un vrai échec de connexion ait eu lieu
(pas de re-vérification serveur). Un attaquant connaissant juste un email
pouvait déclencher un verrouillage en 4 appels bruts en quelques secondes.

**Mitigation appliquée** (migration
`20260824100000_harden_record_login_failure_throttle.sql`, déjà live en
prod) : anti-spam porté de 2s à 30s minimum entre deux échecs comptés pour
un même compte. Verrouillage instantané devenu impraticable.

**Correctif complet, non fait, en réserve** ("option 1") : faire transiter
toute la tentative de connexion par l'Edge Function `login-security` (seule
à appeler `signInWithPassword`, captcha consommé une fois), qui déciderait
alors seule si un échec est réel avant d'incrémenter le compteur en
`service_role`. Reporté pour ne pas risquer de régression sur le parcours de
connexion tout juste stabilisé — détails complets dans
`docs/SECURITY-NOTES.md`.

## 5. État à la fin de la session

- Site en ligne (`aypik.fr`) : à jour et fonctionnel, CAPTCHA + verrouillage
  actifs, testés.
- Supabase (projet `dtsyeouinmpjvdgwkncu`) : migration de durcissement
  appliquée et active en prod.
- Git/GitHub (`expresscde01-cmyk/aypik`) : tout committé et poussé sur
  `main` (commit `887036e`, après `8851d69`).
- Rien en attente côté déploiement. Seul point ouvert : l'option 1 ci-dessus,
  à reprendre seulement si besoin (abus réel constaté, ou volumétrie
  d'utilisateurs plus importante).

## Autres points ouverts, indépendants de cette session (rappel)

- Les 79 comptes de test dans la base : ne pas y toucher sans demande
  explicite de l'utilisateur, notamment les 4 comptes "fondateurs" suspects
  (numéros 3, 4, 7, 11).
- Un fichier vide `Turnstile.tsx.txt` traîne dans `src/components` sur le PC
  de l'utilisateur (reliquat d'un essai manuel) — inoffensif, suppression
  facultative.
