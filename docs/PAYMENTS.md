# Paiements Premium — configuration

## 1. Migrations SQL

Exécutez dans l’ordre (SQL Editor Supabase) :

1. `20260811110000_freemium_membership.sql`
2. `20260811120000_premium_price.sql`
3. `20260811130000_payment_subscriptions.sql`

## 2. Stripe

1. Créez un produit **Premium** avec un prix récurrent **19,99 € / mois**.
2. Copiez l’ID du prix (`price_...`) → `STRIPE_PREMIUM_PRICE_ID`.
3. Clé publique → `VITE_STRIPE_PUBLISHABLE_KEY` dans `.env`.
4. Clé secrète → secret Edge `STRIPE_SECRET_KEY`.
5. Webhook vers `https://<project>.supabase.co/functions/v1/stripe-webhook`  
   Événements : `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`.

## 3. PayPal

1. Créez un **Plan Billing** à 19,99 € / mois (sandbox puis live).
2. `PAYPAL_PREMIUM_PLAN_ID`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
3. `VITE_PAYPAL_CLIENT_ID` dans `.env`.
4. Webhook : `.../functions/v1/paypal-webhook`  
   (`BILLING.SUBSCRIPTION.ACTIVATED`, `CANCELLED`, etc.)

## 4. Déploiement des fonctions

```bash
supabase functions deploy create-stripe-subscription
supabase functions deploy create-paypal-subscription
supabase functions deploy cancel-premium
supabase functions deploy stripe-webhook
supabase functions deploy paypal-webhook
```

## 5. UI

Depuis **Profil** → carte Premium → ouverture de la modale :

- Choix clair **Carte bancaire** (Stripe Elements) ou **PayPal** (redirection)
- Montant **19,99 € / mois** dynamique
- Mention **résiliable à tout moment en un clic**
- Bouton **Résilier Premium** une fois abonné
