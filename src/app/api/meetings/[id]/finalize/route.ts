import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { triggerProcessing } from '@/lib/queue';

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
    .select('status')
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
    return NextResponse.json({ error: 'La reunión ya se está procesando' }, { status: 400 });
  }

  if (meeting.status === 'failed') {
    const { error: updateError } = await supabase
      .from('meetings')
      .update({
        status: 'processing',
        ended_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    triggerProcessing(params.id);
    return NextResponse.json({ ok: true });
  }

  const { error: updateError } = await supabase
    .from('meetings')
    .update({
      status: 'processing',
      ended_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  triggerProcessing(params.id);

  return NextResponse.json({ ok: true });
}
