-- 016_fix_rls_multi_tenant.sql
-- Fix the multi-tenant RLS policy gap. Previously the `users` SELECT policy only
-- allowed reading one's own row, so any policy like
--    org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
-- silently returned NULL because the sub-select had no permission to read `users`.
-- This migration replaces that policy with a SECURITY DEFINER function and adds
-- the missing INSERT/UPDATE/DELETE policies that were not declared explicitly.

-- 1. Helper function: returns the caller's org_id without triggering RLS recursion.
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_user_org_id()
  IS 'Returns org_id of the current authenticated user. SECURITY DEFINER to bypass RLS.';

-- 2. Replace `Users read own` with a policy that ONLY allows reading own row
-- (helper function cannot be used here because it queries users -> recursion)
DROP POLICY IF EXISTS "Users read own" ON users;
CREATE POLICY "Users read own" ON users FOR SELECT
  USING (id = auth.uid());

-- 3. Drop the old `Org members read meetings` that depended on the broken sub-select and
-- replace with one that uses the helper function.
DROP POLICY IF EXISTS "Org members read meetings" ON meetings;
DROP POLICY IF EXISTS "Org members read minutes" ON minutes;

CREATE POLICY "Org members read meetings" ON meetings FOR SELECT
  USING (org_id = public.current_user_org_id());

CREATE POLICY "Org members read minutes" ON minutes FOR SELECT
  USING (meeting_id IN (
    SELECT id FROM meetings WHERE org_id = public.current_user_org_id()
  ));

-- 4. Action items readable by assignee OR org members (same fix).
DROP POLICY IF EXISTS "Read action items" ON action_items;
CREATE POLICY "Read action items" ON action_items FOR SELECT
  USING (
    assignee_user_id = auth.uid()
    OR meeting_id IN (
      SELECT id FROM meetings WHERE org_id = public.current_user_org_id()
    )
  );

-- 5. meeting_chunks had only a SELECT policy; INSERT/UPDATE/DELETE by service role
-- already works through the existing Service role policy, but document explicitly.
DROP POLICY IF EXISTS "Service role all chunks" ON meeting_chunks;
CREATE POLICY "Org members insert chunks" ON meeting_chunks FOR INSERT
  WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY "Service role all chunks" ON meeting_chunks FOR ALL
  USING (true) WITH CHECK (true);

-- 6. Ensure meeting_participants has INSERT/UPDATE/DELETE policies for coordinators (was missing).
DROP POLICY IF EXISTS "Coordinators manage meeting participants" ON meeting_participants;
CREATE POLICY "Coordinators manage meeting participants" ON meeting_participants FOR ALL
  USING (
    meeting_id IN (
      SELECT id FROM meetings WHERE created_by = auth.uid()
    )
  )
  WITH CHECK (
    meeting_id IN (
      SELECT id FROM meetings WHERE created_by = auth.uid()
    )
  );

-- 7. Explicit INSERT policy for `meetings` for coordinators (was implicit through service role).
DROP POLICY IF EXISTS "Coordinators manage meetings" ON meetings;
CREATE POLICY "Coordinators insert meetings" ON meetings FOR INSERT
  WITH CHECK (created_by = auth.uid() AND org_id = public.current_user_org_id());

CREATE POLICY "Creators update own meetings" ON meetings FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creators delete own meetings" ON meetings FOR DELETE
  USING (created_by = auth.uid());

-- 8. Explicit DELETE policy on minutes (was missing — only SELECT was defined).
DROP POLICY IF EXISTS "Service role all minutes" ON minutes;
CREATE POLICY "Creators delete own minutes" ON minutes FOR DELETE
  USING (meeting_id IN (
    SELECT id FROM meetings WHERE created_by = auth.uid()
  ));
CREATE POLICY "Service role all minutes" ON minutes FOR ALL
  USING (true) WITH CHECK (true);

-- 9. INSERT/UPDATE policies for action_items (originally missing) — coordinators create.
DROP POLICY IF EXISTS "Service role all action_items" ON action_items;
CREATE POLICY "Creators manage action_items" ON action_items FOR ALL
  USING (meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid()))
  WITH CHECK (meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid()));
CREATE POLICY "Service role all action_items" ON action_items FOR ALL
  USING (true) WITH CHECK (true);

-- 10. email_logs: only service role should write (caller code uses adminClient).
DROP POLICY IF EXISTS "Service role all email_logs" ON email_logs;
CREATE POLICY "Service role all email_logs" ON email_logs FOR ALL
  USING (true) WITH CHECK (true);
