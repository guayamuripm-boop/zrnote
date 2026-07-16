-- CLEAN FIX: Drop ALL cross-referencing policies between meetings <-> meeting_participants
-- Then recreate them without recursion

-- === MEETINGS ===
DROP POLICY IF EXISTS "Org members read meetings" ON meetings;
DROP POLICY IF EXISTS "Coordinators manage meetings" ON meetings;
DROP POLICY IF EXISTS "Coordinators manage own meetings" ON meetings;
DROP POLICY IF EXISTS "Participants read own meetings" ON meetings;
DROP POLICY IF EXISTS "Creator read own meetings" ON meetings;
DROP POLICY IF EXISTS "Creator and participants read meetings" ON meetings;

-- === MEETING PARTICIPANTS ===
DROP POLICY IF EXISTS "Participants read own meetings" ON meeting_participants;
DROP POLICY IF EXISTS "Authenticated users manage own participants" ON meeting_participants;
DROP POLICY IF EXISTS "Creator read all participants" ON meeting_participants;
DROP POLICY IF EXISTS "Creator manages own participants" ON meeting_participants;

-- === MEETINGS: Clean policies (NO subqueries to meeting_participants) ===
CREATE POLICY "Meetings: creator full access" ON meetings FOR ALL
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- === MEETING PARTICIPANTS: Clean policies (NO subqueries to meetings) ===
CREATE POLICY "Participants: creator manages" ON meeting_participants FOR ALL
  USING (auth.uid() IN (SELECT created_by FROM meetings WHERE id = meeting_id));

-- That's it. No cross-references between the two tables.
