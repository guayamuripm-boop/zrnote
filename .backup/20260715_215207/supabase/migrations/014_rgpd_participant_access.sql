-- RGPD: Allow participants to read their own participation records
-- Previously only meeting creators could see participants

-- Participants can see their own records
CREATE POLICY "Participants read own" ON meeting_participants FOR SELECT
  USING (user_id = auth.uid());

-- Participants can read meetings they attend (needed for export)
CREATE POLICY "Participants read meetings they attend" ON meetings FOR SELECT
  USING (
    auth.uid() = created_by
    OR id IN (
      SELECT meeting_id FROM meeting_participants WHERE user_id = auth.uid()
    )
  );
