-- 017_fix_rls_recursion.sql
-- Fix infinite recursion in RLS policies introduced by 016
-- The helper function current_user_org_id() queries users table,
-- but the users policy was calling the helper function -> circular dependency

-- Fix: users policy only allows reading own row (no helper function)
DROP POLICY IF EXISTS "Users read own" ON users;
CREATE POLICY "Users read own" ON users FOR SELECT
  USING (id = auth.uid());

-- Keep helper function (used by other policies) - it's SECURITY DEFINER so bypasses RLS
-- No change needed to the function itself