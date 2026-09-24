-- Hygiène sécurité, sans changement de comportement :
-- 1) Fixe le search_path (mutable -> figé) sur les fonctions repérées par l'audit Supabase.
--    Aucune ne référence le schéma auth sans le préfixer, donc `public` suffit partout.
-- 2) reject_if_deactivated_interaction est une fonction TRIGGER (pas un usage RPC légitime) :
--    on retire son exécution directe par anon/authenticated (elle continue de tourner
--    normalement via les triggers qui l'appellent, non affectés par ce grant).

ALTER FUNCTION public.count_founders() SET search_path = public;
ALTER FUNCTION public.custom_access_token_hook(jsonb) SET search_path = public;
ALTER FUNCTION public.dept_to_region(text) SET search_path = public;
ALTER FUNCTION public.geo_distance_km(double precision, double precision, double precision, double precision) SET search_path = public;
ALTER FUNCTION public.get_setting_int(text, integer) SET search_path = public;
ALTER FUNCTION public.get_setting_text(text, text) SET search_path = public;
ALTER FUNCTION public.hook_password_verification_attempt(jsonb) SET search_path = public;
ALTER FUNCTION public.inbox_responses_touch_wait_clock() SET search_path = public;
ALTER FUNCTION public.inbox_wait_reminder_body(text, text) SET search_path = public;
ALTER FUNCTION public.location_dept_code(text) SET search_path = public;
ALTER FUNCTION public.min_partner_age(integer) SET search_path = public;
ALTER FUNCTION public.normalize_login_email(text) SET search_path = public;
ALTER FUNCTION public.profile_is_online_for_viewer(timestamp with time zone, timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.protect_deletion_requested_at() SET search_path = public;
ALTER FUNCTION public.protect_founder_identity() SET search_path = public;
ALTER FUNCTION public.protect_paid_premium_meta() SET search_path = public;
ALTER FUNCTION public.protect_profile_gender() SET search_path = public;
ALTER FUNCTION public.protect_testimonial_consent_columns() SET search_path = public;
ALTER FUNCTION public.regions_are_neighbors(text, text) SET search_path = public;
ALTER FUNCTION public.social_notifications_ignore_dup_wait_reminder() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;

REVOKE ALL ON FUNCTION public.reject_if_deactivated_interaction() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_if_deactivated_interaction() TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
