-- Rappel automatique 7 jours avant l'échéance d'une offre ou d'un abonnement.
-- Concerne :
--   A) La fin de la période gratuite de lancement (Fondateurs et non-Fondateurs),
--      calculée via _account_access_phase() -> simplified_free_until.
--   B) Le renouvellement d'un abonnement Premium payant en cours (premium_until).
-- Principe : aucune machine à états, aucun cron par transition — un seul job
-- quotidien qui compare des timestamps et envoie au plus une notification par
-- échéance (colonnes anti-doublon trial_expiry_notified_at / premium_expiry_notified_for).
-- Réutilise l'infrastructure existante : social_notifications + request_social_email()
-- -> edge function send-social-email (nouveau kind 'membership_expiring').

-- 1) Colonnes anti-doublon sur memberships
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS trial_expiry_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS premium_expiry_notified_for timestamptz;

-- 2) mark_notification_emailed : autoriser le nouveau kind 'membership_expiring'
--    (sans quoi les e-mails de ce kind ne seraient jamais marqués comme envoyés
--    et pourraient être renvoyés indéfiniment par request_social_email).
CREATE OR REPLACE FUNCTION public.mark_notification_emailed(p_notification_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE social_notifications
  SET email_sent_at = COALESCE(email_sent_at, now())
  WHERE id = p_notification_id
    AND kind IN ('flash_received', 'like_received', 'match_created', 'membership_expiring');
  RETURN FOUND;
END;
$function$;

-- 3) process_membership_expiry_reminders() : le job quotidien lui-même.
CREATE OR REPLACE FUNCTION public.process_membership_expiry_reminders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_notif_id uuid;
  trial_notified integer := 0;
  premium_notified integer := 0;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  -- A. Fin de la période gratuite de lancement (Fondateur ou non), 7 jours
  --    avant. simplified_free_until vaut founder_premium_until pour un
  --    Fondateur (pas de palier intermédiaire), et created_at + 6 mois pour
  --    un non-Fondateur — dans les deux cas, c'est l'échéance à laquelle le
  --    compte doit choisir une offre.
  FOR r IN
    SELECT m.user_id, m.is_founder, phase.value AS phase_info
    FROM public.memberships m,
    LATERAL (SELECT public._account_access_phase(m.user_id) AS value) AS phase
    WHERE m.trial_expiry_notified_at IS NULL
      AND (phase.value ->> 'simplified_free_until') IS NOT NULL
      AND (phase.value ->> 'simplified_free_until')::timestamptz
        BETWEEN now() AND now() + interval '7 days'
  LOOP
    INSERT INTO public.social_notifications (user_id, kind, title, body)
    VALUES (
      r.user_id,
      'membership_expiring',
      'Ta période gratuite se termine bientôt',
      CASE WHEN r.is_founder THEN
        'Tes avantages Membre Fondateur se terminent dans 7 jours. Ton badge honorifique reste acquis à vie ; pense à choisir ton mode d''accès (simplifié ou détaillé) pour continuer à échanger sans interruption.'
      ELSE
        'Ton accès gratuit se termine dans 7 jours. Pense à choisir ton mode d''accès (simplifié ou détaillé) pour continuer à échanger sans interruption.'
      END
    )
    RETURNING id INTO v_notif_id;

    IF v_notif_id IS NOT NULL THEN
      PERFORM public.request_social_email(v_notif_id);
      trial_notified := trial_notified + 1;
    END IF;

    UPDATE public.memberships SET trial_expiry_notified_at = now() WHERE user_id = r.user_id;
  END LOOP;

  -- B. Renouvellement d'un abonnement payant en cours (Premium, 19,99€),
  --    7 jours avant échéance. Se redéclenche à chaque cycle : la relance
  --    est comparée au premium_until courant (premium_expiry_notified_for),
  --    pas seulement envoyée une fois pour toutes.
  FOR r IN
    SELECT user_id, premium_until
    FROM public.memberships
    WHERE plan = 'premium'
      AND premium_until IS NOT NULL
      AND premium_until BETWEEN now() AND now() + interval '7 days'
      AND premium_expiry_notified_for IS DISTINCT FROM premium_until
  LOOP
    INSERT INTO public.social_notifications (user_id, kind, title, body)
    VALUES (
      r.user_id,
      'membership_expiring',
      'Ton abonnement se renouvelle bientôt',
      'Ton abonnement payant arrive à échéance dans 7 jours. Il se renouvelle automatiquement, sauf résiliation depuis ton profil.'
    )
    RETURNING id INTO v_notif_id;

    IF v_notif_id IS NOT NULL THEN
      PERFORM public.request_social_email(v_notif_id);
      premium_notified := premium_notified + 1;
    END IF;

    UPDATE public.memberships SET premium_expiry_notified_for = r.premium_until WHERE user_id = r.user_id;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'trial_notified', trial_notified, 'premium_notified', premium_notified);
END;
$function$;

-- Fonction interne uniquement (appelée par le cron), pas d'accès direct client.
REVOKE ALL ON FUNCTION public.process_membership_expiry_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_membership_expiry_reminders() TO postgres, service_role;

-- 4) Job pg_cron quotidien (aux côtés de purge-expired-account-deletions à 3:15
--    et expire-inbox-waits à 3:30).
SELECT cron.schedule(
  'membership-expiry-reminders',
  '45 3 * * *',
  $$SELECT public.process_membership_expiry_reminders()$$
);
