import { createServerSupabase } from './server';
import { NextResponse } from 'next/server';

export async function requireAuth() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, supabase, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user, supabase, error: null };
}
