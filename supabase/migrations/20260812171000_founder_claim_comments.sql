/*
  Garantit que claim_signup_offer('founder') enregistre bien is_founder
  via try_claim_founder_slot (plan = founder, numéro, période 6 mois).
  Aucun changement de schéma : documentation + re-grant explicite.
*/

COMMENT ON FUNCTION try_claim_founder_slot(uuid) IS
  'Attribue le statut Membre Fondateur (is_founder=true, plan=founder, founder_number, founder_premium_until) tant que founders < founder_max_slots (500).';

COMMENT ON FUNCTION claim_signup_offer(text) IS
  'Tunnel inscription : claim_signup_offer(''founder'') appelle try_claim_founder_slot ; claim_signup_offer(''free'') crée un membership Freemium.';

COMMENT ON COLUMN memberships.is_founder IS
  'True si le membre a obtenu une place Fondateur (numerus clausus 500).';

COMMENT ON COLUMN memberships.founder_number IS
  'Numéro d’ordre Fondateur (1..500), null sinon.';
