import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { corsHeaders } from '@/lib/cors';

/**
 * ONE place where the session is refreshed.
 *
 * That is the whole point of doing it here, and it used to only half happen:
 * the matcher covered `/api/:path*`, but the Supabase half ran exclusively for
 * `/dashboard`. So an API request arriving with an expired access token had to
 * refresh it inside the route handler itself — and Supabase ROTATES refresh
 * tokens, meaning the first request to use one invalidates it for everyone
 * else. A dashboard page fires several server-side calls at once; whichever
 * ones lost that race got "Invalid Refresh Token: Already Used" and answered
 * 401 while the user was very much logged in.
 *
 * That is what put a red "Unauthorized" under the terms dialog, on the one
 * screen that blocks the whole app until it is accepted: the modal rendered
 * (its GET had won the race), and accepting it lost. Refreshing once here,
 * before anything downstream looks at the session, removes the race instead of
 * making each route handler survive it.
 */

/** Supabase stores the session in `sb-<ref>-auth-token`, possibly chunked. */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
}

export async function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: cors });
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard');
  // Cron routes authenticate with a shared secret, never a session, and they
  // are the one place where an extra auth round-trip buys nothing at all.
  const isCron = request.nextUrl.pathname.startsWith('/api/cron');

  if (isDashboard || (!isCron && hasSessionCookie(request))) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request: { headers: request.headers } });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // Refreshes the token and, through setAll above, writes the new cookies
    // onto both this request (so the route handler sees them) and the
    // response (so the browser keeps them).
    const { data: { user } } = await supabase.auth.getUser();

    // Only the dashboard is GATED. An API route answers for itself — turning a
    // missing session into a redirect there would hand callers an HTML login
    // page where they expected JSON.
    if (!user && isDashboard) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Applied LAST, on whatever response object survived: `setAll` replaces it
  // when a refresh happens, and setting these first meant a refreshed request
  // silently lost every CORS header it was given.
  for (const [key, value] of Object.entries(cors)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
