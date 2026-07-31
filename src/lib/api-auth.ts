import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Resolve the caller for an API route, from a session cookie OR a bearer token.
 *
 * The browser app authenticates with cookies. The Chrome extension cannot: its
 * requests are cross-site, and Supabase's auth cookie is `SameSite=Lax`, so the
 * browser never attaches it — which is why every extension call has always come
 * back 401 (it used `credentials: 'include'` and simply hoped). Extensions send
 * `Authorization: Bearer <access_token>` instead, read from the user's own
 * session on the ZRNote domain.
 *
 * Returns a `supabase` client scoped to that user, so RLS still applies exactly
 * as it does for a cookie-authenticated request.
 */
export interface AuthedUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
}

export async function getAuthedUser(request: Request): Promise<
  { user: AuthedUser; supabase: any; via: 'cookie' | 'bearer' } | null
> {
  const header = request.headers.get('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (bearer) {
    // Never accept the service-role key here: it would bypass RLS entirely and
    // let any caller act as every user at once.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (serviceKey && bearer === serviceKey) return null;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );

    const { data, error } = await supabase.auth.getUser(bearer);
    if (error || !data?.user) return null;

    return { user: data.user, supabase, via: 'bearer' };
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return { user, supabase, via: 'cookie' };
}
