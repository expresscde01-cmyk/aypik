# Paiements Premium & Boost — configuration

## 1. Migrations SQL

Exécutez dans l’ordre (SQL Editor Supabase) :

1. `20260811110000_freemium_membership.sql`
2. `20260811120000_premium_price.sql`
3. `20260811130000_payment_subscriptions.sql`
4. `20260812160000_boost_paid_activation.sql`

## 2. Stripe

1. Produit **Premium** : prix récurrent **19,99 € / mois** → `STRIPE_PREMIUM_PRICE_ID`.
2. Boost 24 h : PaymentIntent **2,99 €** créé dynamiquement (pas de Price ID requis).
3. Clé publique → `VITE_STRIPE_PUBLISHABLE_KEY`.
4. Clé secrète → `STRIPE_SECRET_KEY`.
5. Webhook `.../functions/v1/stripe-webhook`  
   Événements : `invoice.payment_succeeded`, `customer.subscription.*`, **`payment_intent.succeeded`** (Boost).

## 3. PayPal

1. Plan Billing Premium 19,99 € / mois → `PAYPAL_PREMIUM_PLAN_ID`.
2. Boost : Checkout Orders (CAPTURE) 2,99 € via API.
3. `VITE_PAYPAL_CLIENT_ID`, secrets Edge `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`.
4. Webhook Premium : `BILLING.SUBSCRIPTION.*`

## 4. Déploiement des fonctions

```bash
supabase functions deploy create-stripe-subscription
supabase functions deploy create-stripe-boost-payment
supabase functions deploy create-paypal-subscription
supabase functions deploy create-paypal-boost-order
supabase functions deploy capture-paypal-boost-order
supabase functions deploy cancel-premium
supabase functions deploy stripe-webhook
supabase functions deploy paypal-webhook
```

## 5. UI

- **Premium** et **Boost** ouvrent une modale de récap avec choix **Carte bancaire (Stripe Elements)** ou **PayPal** (bouton officiel jaune).
- Après paiement réussi en inscription → redirection automatique vers **l’étape profil**.
