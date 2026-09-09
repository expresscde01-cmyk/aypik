
-- Faille critique : activate_paid_premium(p_user_id, p_provider, p_period_end) était
-- exécutable par anon ET authenticated, sans aucune vérification de l'appelant ni
-- correspondance auth.uid() = p_user_id. N'importe qui pouvait s'octroyer (ou octroyer
-- à un tiers) le statut Premium payant gratuitement via un simple appel RPC, sans
-- paiement réel. La fonction n'a de sens qu'appelée par les webhooks de paiement
-- (stripe-webhook, create-paypal-subscription) qui utilisent déjà la clé service_role
-- et n'ont donc besoin d'aucun droit anon/authenticated.
-- Aucun compte n'a actuellement plan='premium' en base : pas d'exploitation détectée.
REVOKE EXECUTE ON FUNCTION public.activate_paid_premium(uuid, text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.activate_paid_premium(uuid, text, timestamptz) FROM authenticated;

NOTIFY pgrst, 'reload schema';
