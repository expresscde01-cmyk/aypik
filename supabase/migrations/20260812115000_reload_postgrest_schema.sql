-- Force PostgREST to pick up claim_signup_offer after deployment.
SELECT pg_notification_queue_usage();
NOTIFY pgrst, 'reload schema';
