import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const STALE_PROCESSING_MS = 10 * 60 * 1000;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: meeting } = await supabase
    .from('meetings')
    .select('status, ended_at')
    .eq('id', params.id)
    .eq('created_by', user.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  if (meeting.status === 'completed') {
    return NextResponse.json({ error: 'La reunión ya fue procesada' }, { status: 400 });
  }

  if (meeting.status === 'processing') {
    const startedAt = meeting.ended_at ? new Date(meeting.ended_at).getTime() : 0;
    const isStale = Date.now() - startedAt > STALE_PROCESSING_MS;
    if (!isStale) {
      return NextResponse.json({ error: 'La reunión ya se está procesando' }, { status: 400 });
    }
  }

  if (meeting.status === 'failed' || meeting.status === 'processing') {
    const { error } = await supabase
      .from('meetings')
      .update({
        status: 'processing',
        ended_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, nextStep: 'transcribe' });
  }

  const { error } = await supabase
    .from('meetings')
    .update({
      status: 'processing',
      ended_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, nextStep: 'transcribe' });
}