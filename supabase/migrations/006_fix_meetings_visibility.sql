-- ============================================
-- FIX: Visibilidad de reuniones + permisos de email
-- ============================================

-- 1. Drop the overly permissive policies
DROP POLICY IF EXISTS "Coordinators manage meetings" ON meetings;
DROP POLICY IF EXISTS "Org members read meetings" ON meetings;

-- 2. Coordinators can only manage meetings they created
CREATE POLICY "Coordinators manage own meetings" ON meetings FOR ALL
  USING (auth.uid() = created_by);

-- 3. Participants can read meetings they're in
CREATE POLICY "Participants read own meetings" ON meetings FOR SELECT
  USING (
    id IN (SELECT meeting_id FROM meeting_participants WHERE user_id = auth.uid())
  );

-- 4. Meeting creator can read all action_items for their meetings
CREATE POLICY "Creator read all action items" ON action_items FOR SELECT
  USING (
    meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid())
  );

-- 5. Meeting creator can read all participants for their meetings
CREATE POLICY "Creator read all participants" ON meeting_participants FOR SELECT
  USING (
    meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid())
  );

-- 6. Meeting creator can read coordinator user info (for email lookup)
CREATE POLICY "Read coordinator info" ON users FOR SELECT
  USING (
    id IN (SELECT created_by FROM meetings WHERE created_by = auth.uid())
  );
