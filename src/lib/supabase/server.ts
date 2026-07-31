import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client bound to the caller's session cookies.
 *
 * Async since Next 15: `cookies()` returns a Promise there, so every call site
 * must `await` this. It also uses @supabase/ssr's `getAll`/`setAll` API — the
 * old `get`/`set`/`remove` triple is deprecated and mishandles the chunked
 * cookies Supabase writes for large sessions.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, which cannot write cookies.
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    }
  );
}
