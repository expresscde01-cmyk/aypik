-- FORCE RLS ciblé (2026-09-09). Remplace 20260815190000 (archivé).
-- login_security volontairement hors périmètre.

alter table public.declined_archives force row level security;
alter table public.email_dispatch_settings force row level security;
alter table public.lock_email_outbox force row level security;

-- login_security intentionnellement exclu : revue dédiée à prévoir séparément.
