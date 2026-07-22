-- 018_rls_reset_no_recursion.sql
-- DEFINITIVE fix for "infinite recursion detected in policy for relation meetings".
--
-- Root cause: RLS migrations 001/006 created a policy on `meetings` that
-- subqueries `meeting_participants`, while `meeting_participants` has a policy
-- that subqueries `meetings`. Postgres evaluates them in a cycle -> 42P17.
-- Later migrations only dropped SOME policies by name, so the live DB ended up
-- in a mixed state with recursive policies still active.
--
-- This migration is IDEMPOTENT and STATE-AGNOSTIC: it drops EVERY policy on the
-- affected tables (via a dynamic loop, regardless of name) and recreates a clean,
-- non-recursive set. All cross-table checks go through SECURITY DEFINER helper
-- functions, which bypass RLS and therefore cannot re-enter another table's policy.
--
-- HOW TO APPLY: paste this whole file into Supabase → SQL Editor → Run.

-- ---------------------------------------------------------------------------
-- 1. SECURITY DEFINER helpers (bypass RLS -> break any policy cycle)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT org_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_meeting_creator(m_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings WHERE id = m_id AND created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_meeting_participant(m_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants
    WHERE meeting_id = m_id AND user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Drop ALL existing policies on the affected tables (name-agnostic)
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'users', 'meetings', 'meeting_participants',
        'minutes', 'action_items', 'meeting_chunks', 'email_logs'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Make sure RLS is on (idempotent).
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minutes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs           ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. USERS
-- ---------------------------------------------------------------------------
-- Read own row, or any row in your org (org lookup via SECURITY DEFINER fn).
CREATE POLICY "users_select" ON public.users FOR SELECT
  USING (id = auth.uid() OR org_id = public.current_user_org_id());

-- Insert / update your own row (profile bootstrap also runs via service role).
CREATE POLICY "users_insert_self" ON public.users FOR INSERT
  WITH CHECK (id = auth.uid());
CREATE POLICY "users_update_self" ON public.users FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "users_service_role" ON public.users FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. MEETINGS  (no direct reference to meeting_participants -> no cycle;
--    participant access goes through the SECURITY DEFINER helper)
-- ---------------------------------------------------------------------------
CREATE POLICY "meetings_creator_all" ON public.meetings FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "meetings_org_select" ON public.meetings FOR SELECT
  USING (org_id IS NOT NULL AND org_id = public.current_user_org_id());

CREATE POLICY "meetings_participant_select" ON public.meetings FOR SELECT
  USING (public.is_meeting_participant(id));

CREATE POLICY "meetings_service_role" ON public.meetings FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5. MEETING_PARTICIPANTS
-- ---------------------------------------------------------------------------
CREATE POLICY "participants_creator_all" ON public.meeting_participants FOR ALL
  USING (public.is_meeting_creator(meeting_id))
  WITH CHECK (public.is_meeting_creator(meeting_id));

CREATE POLICY "participants_self_select" ON public.meeting_participants FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "participants_service_role" ON public.meeting_participants FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6. MINUTES
-- ---------------------------------------------------------------------------
CREATE POLICY "minutes_select" ON public.minutes FOR SELECT
  USING (
    public.is_meeting_creator(meeting_id)
    OR public.is_meeting_participant(meeting_id)
  );

CREATE POLICY "minutes_service_role" ON public.minutes FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 7. ACTION_ITEMS
-- ---------------------------------------------------------------------------
CREATE POLICY "action_items_select" ON public.action_items FOR SELECT
  USING (
    assignee_user_id = auth.uid()
    OR public.is_meeting_creator(meeting_id)
  );

CREATE POLICY "action_items_creator_manage" ON public.action_items FOR ALL
  USING (public.is_meeting_creator(meeting_id))
  WITH CHECK (public.is_meeting_creator(meeting_id));

CREATE POLICY "action_items_service_role" ON public.action_items FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 8. MEETING_CHUNKS (RAG) — created in migration 012; guard in case it's absent
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='meeting_chunks') THEN
    EXECUTE 'ALTER TABLE public.meeting_chunks ENABLE ROW LEVEL SECURITY';
    EXECUTE $p$CREATE POLICY "chunks_org_select" ON public.meeting_chunks FOR SELECT
              USING (org_id = public.current_user_org_id())$p$;
    EXECUTE $p$CREATE POLICY "chunks_service_role" ON public.meeting_chunks FOR ALL
              TO service_role USING (true) WITH CHECK (true)$p$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9. EMAIL_LOGS — service role only (app writes via admin client)
-- ---------------------------------------------------------------------------
CREATE POLICY "email_logs_service_role" ON public.email_logs FOR ALL
  TO service_role USING (true) WITH CHECK (true);
