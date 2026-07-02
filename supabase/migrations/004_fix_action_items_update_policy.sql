-- Fix: allow coordinators to update action_items assignee_email/name
CREATE POLICY "Coordinators update action items" ON action_items FOR UPDATE
  USING (
    meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid())
  )
  WITH CHECK (
    meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid())
  );
