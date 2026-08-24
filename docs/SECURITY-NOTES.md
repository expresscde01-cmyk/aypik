# Notes de sécurité — décisions en attente

Ce fichier sert de mémo pour les points de sécurité identifiés mais
volontairement reportés. À consulter avant toute intervention sur
l'authentification / le verrouillage de compte.

## Verrouillage de compte après échecs de connexion — faille résiduelle (2026-08-24)

**Contexte** : ajout du CAPTCHA Cloudflare Turnstile (frontend + Supabase
Attack Protection) en complément du verrouillage après 4 échecs de mot de
passe (`public.login_security`, RPC `record_login_failure`).

**Faille identifiée** : la RPC `record_login_failure` reste exécutable avec
la clé publique `anon` sans qu'un vrai échec de connexion ait eu lieu — rien
ne revérifie côté serveur qu'une tentative de mot de passe a réellement
échoué. Un attaquant connaissant seulement l'email d'une victime peut donc,
en théorie, appeler cette RPC directement (hors interface, hors CAPTCHA) pour
déclencher un verrouillage artificiel de son compte (DoS de type "gênant",
pas de perte de données ni d'accès non autorisé — rien n'empêche par ailleurs
une vraie connexion via l'API Auth officielle même si `locked_at` est posé,
le verrouillage n'est qu'une couche applicative côté UI).

**Mitigation appliquée (2026-08-24)** : migration
`harden_record_login_failure_throttle` — anti-spam porté de 2s à **30s**
minimum entre deux échecs comptés pour un même compte. Un verrouillage
instantané par appels bruts devient impraticable (≥ 90s au lieu de 6-8s pour
atteindre 4 échecs). Voir aussi le `COMMENT ON FUNCTION` posé sur
`public.record_login_failure` et le commentaire dans
`src/lib/loginSecurity.ts` au-dessus de `recordLoginFailure()`.

**Option 1 — correctif structurel complet (non implémenté, en réserve)** :
faire transiter la tentative de connexion elle-même par l'Edge Function
`login-security` au lieu que le client appelle directement
`supabase.auth.signInWithPassword()`. L'Edge Function deviendrait la seule à
tenter la vraie connexion (captcha consommé une seule fois côté serveur), et
déciderait donc seule si un échec est réel avant d'appeler
`record_login_failure` avec le rôle `service_role` (dont on retirerait alors
les droits `anon`/`authenticated`).

- Pourquoi reporté : touche le cœur du parcours de connexion, qui vient
  d'être stabilisé après une session de débogage longue (bug Navigator
  LockManager notamment). Risque de régression jugé non justifié par la
  gravité réelle de la faille (gêne, pas de compromission).
- Déclencheurs pour reprendre ce chantier : trafic/abus réel constaté sur le
  verrouillage de comptes, ou passage à une volumétrie d'utilisateurs rendant
  le risque plus concret.

**Alternative payante** : plan Supabase **Team** (599 $/mois au 2026-08-24,
cf. [supabase.com/pricing](https://supabase.com/pricing)) pour débloquer le
hook natif **"Password Verification Attempt"** (indisponible sur Free *et*
Pro — seuls Team et Enterprise l'incluent). GoTrue déclencherait alors
lui-même ce hook uniquement après une vraie vérification de mot de passe,
sans que ce soit falsifiable depuis le client. Jugé disproportionné pour la
gravité actuelle de la faille sur un site qui démarre.

**Pour retrouver ce mémo plus tard** : ce fichier (`docs/SECURITY-NOTES.md`),
ou chercher "Option 1" / "record_login_failure" dans le dépôt, ou lire le
commentaire sur la fonction côté base :
```sql
select obj_description('public.record_login_failure(text)'::regprocedure);
```
