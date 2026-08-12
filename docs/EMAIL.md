# E-mails & authentification

## Principes

1. **Auth ≠ e-mails produit**  
   L’inscription / connexion passent par Supabase Auth (`src/lib/authApi.ts`).  
   Aucun fournisseur mail ne doit bloquer `signUp` / `signIn`.

2. **Couche modulaire** (`src/lib/email/`)  
   - `noop` (défaut) : n’envoie rien, parfait en local / lancement Fondateur.  
   - `edge` : relais vers une Edge Function `send-email` (Resend, SendGrid, etc.).

3. **E-mails Auth** (confirmation, reset password)  
   Se configurent côté projet Supabase (SMTP dashboard, Auth Hooks).  
   Pas dans le frontend React.

## Réactiver / brancher un provider

```bash
# .env
VITE_EMAIL_PROVIDER=noop   # défaut
# VITE_EMAIL_PROVIDER=edge  # quand send-email est déployée
```

Implémentez le vrai envoi dans `supabase/functions/send-email` (clés API serveur uniquement).

## Paiements

`ENABLE_PAYMENTS` dans `src/lib/payments.ts` (indépendant des e-mails).
Les Fondateurs ont l’accès Premium à 0 € via `isFounderComplimentaryAccess`
— le checkout Stripe/PayPal reste pour Freemium → Premium / Boost payants.
