import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app'), { status: 303 });
  response.cookies.set('sb-auth-token', '', { maxAge: 0, path: '/' });
  response.cookies.set('sb-access-token', '', { maxAge: 0, path: '/' });
  response.cookies.set('sb-refresh-token', '', { maxAge: 0, path: '/' });

  return response;
}

export async function POST() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app'), { status: 303 });
  response.cookies.set('sb-auth-token', '', { maxAge: 0, path: '/' });
  response.cookies.set('sb-access-token', '', { maxAge: 0, path: '/' });
  response.cookies.set('sb-refresh-token', '', { maxAge: 0, path: '/' });

  return response;
}
