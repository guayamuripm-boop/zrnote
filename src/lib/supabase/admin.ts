import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client — BYPASSES RLS. Server-only.
 *
 * The single place that builds it, so the key lookup (and its legacy
 * `SUPABASE_SERVICE_KEY` fallback) lives in one spot instead of ~19.
 * Never accept the service key from a request (see api-auth.ts): callers must
 * have already authorised the action through a session, a signed token, or
 * `assertCron()`.
 */
export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!,
  );
}
