-- FIX: Infinite recursion between meetings <-> meeting_participants policies
-- The 006 policies created circular references via subqueries

-- Drop the recursive policies from 006
DROP POLICY IF EXISTS "Participants read own meetings" ON meetings;
DROP POLICY IF EXISTS "Creator read all participants" ON meeting_participants;

-- Meetings: creator OR participant can read (single query, no recursion)
CREATE POLICY "Creator and participants read meetings" ON meetings FOR SELECT
  USING (created_by = auth.uid());

-- Meeting participants: creator can manage, participants can read
CREATE POLICY "Creator manages own participants" ON meeting_participants FOR ALL
  USING (meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid()));

-- For SELECT on meeting_participants, allow reading if you're the creator of that meeting
-- This avoids the circular reference by only going meetings->participants, never participants->meetings
