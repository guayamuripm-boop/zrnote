import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { speaker_map } = body;

  if (!speaker_map || typeof speaker_map !== 'object') {
    return NextResponse.json({ error: 'Invalid speaker_map' }, { status: 400 });
  }

  const { error } = await supabase
    .from('meetings')
    .update({ speaker_map })
    .eq('id', params.id)
    .eq('created_by', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
