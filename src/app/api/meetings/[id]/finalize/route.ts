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
    .select('*')
    .eq('id', params.id)
    .eq('created_by', user.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
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

  try {
    await triggerProcessing(params.id);
  } catch (err: any) {
    await supabase
      .from('meetings')
      .update({ status: 'scheduled' })
      .eq('id', params.id);

    return NextResponse.json(
      { error: err.message || 'Error al procesar' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
