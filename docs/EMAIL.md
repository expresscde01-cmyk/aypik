# E-mails & authentification

## Séparation claire

| Type | Qui envoie | Où |
|------|------------|-----|
| Auth (confirm, reset) | Supabase Auth / SMTP Resend dashboard | Projet Supabase |
| Produit (welcome, alertes, communauté) | App → Edge Function `send-email` → Resend API | `src/lib/email/` |

Le flux d’inscription / login **ne dépend jamais** de Resend.

## Activation Resend (e-mails applicatifs)

1. Secrets Edge Function (Supabase Dashboard → Edge Functions → Secrets) :
   ```
   RESEND_API_KEY=re_...
   RESEND_FROM_EMAIL=Aypik <bonjour@votredomaine.fr>
   ```
2. Déployer :
   ```bash
   supabase functions deploy send-email
   ```
3. Client (`.env`) :
   ```bash
   VITE_EMAIL_PROVIDER=edge
   ```
   (`noop` uniquement pour tests sans envoi)

## API applicative

```ts
import {
  notifyWelcomeAfterProfile,
  notifyProductAlert,
  notifyCommunityAlert,
  sendTransactionalEmail,
} from '@/lib/email';

// Accueil après validation profil (déjà branché dans ProfileSetup)
notifyWelcomeAfterProfile({ email, displayName, isFounder: true });

// Alertes produit / communauté (prêtes à l’emploi)
notifyProductAlert({ email, title: '…', body: '…' });
notifyCommunityAlert({ email, title: '…', body: '…' });
```

Changer de fournisseur plus tard : remplacer l’implémentation dans
`supabase/functions/send-email` (ou un autre `EmailProvider`) — le reste
de l’app continue d’appeler `src/lib/email`.

## Paiements

Indépendant : `ENABLE_PAYMENTS` dans `src/lib/payments.ts`.
