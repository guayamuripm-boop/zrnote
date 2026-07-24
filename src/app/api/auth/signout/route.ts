import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Redirect relative to the ACTUAL incoming request origin — never build the
// target from NEXT_PUBLIC_APP_URL, which can drift from the real deployment
// domain (preview URLs, trailing slash, domain changes) and send the user to
// a dead page after logout.
async function handleSignOut(request: Request) {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  response.cookies.set('sb-auth-token', '', { maxAge: 0, path: '/' });
  response.cookies.set('sb-access-token', '', { maxAge: 0, path: '/' });
  response.cookies.set('sb-refresh-token', '', { maxAge: 0, path: '/' });

  return response;
}

export async function GET(request: Request) {
  return handleSignOut(request);
}

export async function POST(request: Request) {
  return handleSignOut(request);
}
