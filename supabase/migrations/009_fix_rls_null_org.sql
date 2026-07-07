-- Fix RLS: allow creators to see own meetings regardless of org
-- Handle NULL org_id case

-- ========= MEETINGS =========
DROP POLICY IF EXISTS "Meetings: creator full access" ON meetings;
DROP POLICY IF EXISTS "Org members read meetings" ON meetings;
DROP POLICY IF EXISTS "Coordinators manage meetings" ON meetings;
DROP POLICY IF EXISTS "Coordinators manage own meetings" ON meetings;
DROP POLICY IF EXISTS "Participants read own meetings" ON meetings;

CREATE POLICY "Meetings: creator full access" ON meetings FOR ALL
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- ========= MINUTES =========
DROP POLICY IF EXISTS "Org members read minutes" ON minutes;

CREATE POLICY "Minutes: creator read" ON minutes FOR SELECT
  USING (meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid()));

CREATE POLICY "Minutes: participants read" ON minutes FOR SELECT
  USING (meeting_id IN (SELECT meeting_id FROM meeting_participants WHERE user_id = auth.uid()));

-- ========= ACTION ITEMS =========
DROP POLICY IF EXISTS "Read action items" ON action_items;

CREATE POLICY "Action items: creator read" ON action_items FOR SELECT
  USING (meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid()));

CREATE POLICY "Action items: assignee read" ON action_items FOR SELECT
  USING (assignee_user_id = auth.uid());

-- ========= MEETING PARTICIPANTS =========
DROP POLICY IF EXISTS "Participants: creator manages" ON meeting_participants;
DROP POLICY IF EXISTS "Creator read all participants" ON meeting_participants;

CREATE POLICY "Participants: creator manages" ON meeting_participants FOR ALL
  USING (auth.uid() IN (SELECT created_by FROM meetings WHERE id = meeting_id));

-- ========= USERS =========
DROP POLICY IF EXISTS "Read coordinator info" ON users;
DROP POLICY IF EXISTS "Users read own" ON users;

CREATE POLICY "Users: read own" ON users FOR SELECT
  USING (auth.uid() = id);

-- ========= EMAIL LOGS =========
DROP POLICY IF EXISTS "Service role all email_logs" ON email_logs;
CREATE POLICY "Email logs: service role all" ON email_logs FOR ALL USING (true) WITH CHECK (true);

-- Service role bypass policies (for Edge Function)
DROP POLICY IF EXISTS "Service role all" ON users;
DROP POLICY IF EXISTS "Service role all meetings" ON meetings;
DROP POLICY IF EXISTS "Service role all participants" ON meeting_participants;
DROP POLICY IF EXISTS "Service role all minutes" ON minutes;
DROP POLICY IF EXISTS "Service role all action_items" ON action_items;

CREATE POLICY "Service role all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role all meetings" ON meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role all participants" ON meeting_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role all minutes" ON minutes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role all action_items" ON action_items FOR ALL USING (true) WITH CHECK (true);
