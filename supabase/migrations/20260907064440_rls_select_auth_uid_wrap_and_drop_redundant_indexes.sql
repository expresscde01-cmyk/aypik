-- Perf cleanup identified by DB audit (2026-09-07): wrap auth.uid() in (select ...) in RLS
-- policies so it is evaluated once per statement instead of once per row (Supabase advisor:
-- auth_rls_initplan). No logic change, no data touched. Also drop 3 indexes made redundant
-- by an existing composite/unique index on the same leading column.
-- Applied live via Supabase MCP (project dtsyeouinmpjvdgwkncu) on 2026-09-07, recorded in
-- supabase_migrations.schema_migrations as version 20260907064440. This file mirrors that
-- change in the repo so it is not lost in the COLLER-*.sql / migrations drift.

ALTER POLICY conversations_insert_participants ON public.conversations
  WITH CHECK (((select auth.uid()) = user_a) OR ((select auth.uid()) = user_b));

ALTER POLICY conversations_select_participants ON public.conversations
  USING (((select auth.uid()) = user_a) OR ((select auth.uid()) = user_b));

ALTER POLICY conversations_update_participants ON public.conversations
  USING (((select auth.uid()) = user_a) OR ((select auth.uid()) = user_b))
  WITH CHECK (((select auth.uid()) = user_a) OR ((select auth.uid()) = user_b));

ALTER POLICY declined_archives_delete_own ON public.declined_archives
  USING ((select auth.uid()) = user_id);

ALTER POLICY declined_archives_insert_own ON public.declined_archives
  WITH CHECK (((select auth.uid()) = user_id) AND (user_id <> actor_id));

ALTER POLICY declined_archives_select_own ON public.declined_archives
  USING ((select auth.uid()) = user_id);

ALTER POLICY declined_archives_update_own ON public.declined_archives
  USING ((select auth.uid()) = user_id)
  WITH CHECK (((select auth.uid()) = user_id) AND (user_id <> actor_id));

ALTER POLICY flashes_delete_own ON public.flashes
  USING ((select auth.uid()) = from_user);

ALTER POLICY flashes_insert_own ON public.flashes
  WITH CHECK ((select auth.uid()) = from_user);

ALTER POLICY flashes_select_own ON public.flashes
  USING (((select auth.uid()) = from_user) OR ((select auth.uid()) = to_user));

ALTER POLICY inbox_responses_delete_own ON public.inbox_responses
  USING (((select auth.uid()) = user_id) AND (decision = ANY (ARRAY['wait'::text, 'refuse'::text])));

ALTER POLICY inbox_responses_insert_own ON public.inbox_responses
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY inbox_responses_select_own ON public.inbox_responses
  USING ((select auth.uid()) = user_id);

ALTER POLICY inbox_responses_update_own ON public.inbox_responses
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY likes_delete_own ON public.likes
  USING ((select auth.uid()) = from_user);

ALTER POLICY likes_insert_own ON public.likes
  WITH CHECK ((select auth.uid()) = from_user);

ALTER POLICY likes_select_own ON public.likes
  USING (((select auth.uid()) = from_user) OR ((select auth.uid()) = to_user));

ALTER POLICY match_bonds_select_participants ON public.match_bonds
  USING (((select auth.uid()) = user_a) OR ((select auth.uid()) = user_b));

ALTER POLICY match_breaks_select_own ON public.match_breaks
  USING ((select auth.uid()) = user_id);

ALTER POLICY notifications_select_own ON public.membership_notifications
  USING ((select auth.uid()) = user_id);

ALTER POLICY notifications_update_own ON public.membership_notifications
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY memberships_insert_own ON public.memberships
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY memberships_update_own ON public.memberships
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY messages_insert_authenticated ON public.messages
  WITH CHECK (((select auth.uid()) = sender_id) AND (sender_id <> recipient_id));

ALTER POLICY messages_select_participants ON public.messages
  USING (((select auth.uid()) = sender_id) OR ((select auth.uid()) = recipient_id));

ALTER POLICY messages_update_recipient ON public.messages
  USING ((select auth.uid()) = recipient_id)
  WITH CHECK ((select auth.uid()) = recipient_id);

ALTER POLICY payment_subs_select_own ON public.payment_subscriptions
  USING ((select auth.uid()) = user_id);

ALTER POLICY boosts_insert_own ON public.profile_boosts
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY profiles_delete_own ON public.profiles
  USING ((select auth.uid()) = id);

ALTER POLICY profiles_insert_own ON public.profiles
  WITH CHECK ((select auth.uid()) = id);

ALTER POLICY profiles_select_all ON public.profiles
  USING ((deletion_requested_at IS NULL) OR (id = (select auth.uid())));

ALTER POLICY profiles_update_own ON public.profiles
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

ALTER POLICY social_notifications_delete_own_declined ON public.social_notifications
  USING (((select auth.uid()) = user_id) AND (kind = 'match_declined'::text));

ALTER POLICY social_notifications_select_own ON public.social_notifications
  USING ((select auth.uid()) = user_id);

ALTER POLICY social_notifications_update_own ON public.social_notifications
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY testimonials_select_own ON public.testimonials
  USING ((select auth.uid()) = user_id);

-- Redundant indexes: their leading column is already covered by another index/constraint
-- on the same table (composite or unique), so these add write overhead with no read benefit.
DROP INDEX IF EXISTS public.idx_likes_from_user;
DROP INDEX IF EXISTS public.idx_flashes_from_user;
DROP INDEX IF EXISTS public.idx_conversations_user_a;
