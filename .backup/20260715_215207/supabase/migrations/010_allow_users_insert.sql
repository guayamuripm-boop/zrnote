-- Fix: allow authenticated users to insert/update their own user profile
-- Without this, signup creates auth.users but public.users insert fails due to RLS

CREATE POLICY "Users: insert own" ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users: update own" ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
