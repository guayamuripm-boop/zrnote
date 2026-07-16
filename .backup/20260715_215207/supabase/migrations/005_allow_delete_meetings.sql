-- Fix: allow authenticated users to delete meetings they created
CREATE POLICY "Authenticated users delete own meetings" ON meetings FOR DELETE
  USING (auth.uid() = created_by);
