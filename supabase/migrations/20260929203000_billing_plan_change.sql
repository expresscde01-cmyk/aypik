-- Descente en gamme : l'offre actuelle reste jusqu'à pending_plan_at.
-- Un nouvel abonnement peut remplacer un précédent (replaces_subscription_id).
-- Rejouer ce fichier est sans effet.

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS pending_plan text,
  ADD COLUMN IF NOT EXISTS pending_plan_at timestamptz;

ALTER TABLE public.payment_subscriptions
  ADD COLUMN IF NOT EXISTS replaces_subscription_id text;

NOTIFY pgrst, 'reload schema';
