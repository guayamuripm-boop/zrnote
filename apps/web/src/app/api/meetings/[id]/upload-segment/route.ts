import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const audioFile = formData.get('audio') as File;
  const segmentIndex = parseInt(formData.get('segmentIndex') as string, 10);

  if (!audioFile || isNaN(segmentIndex)) {
    return NextResponse.json({ error: 'Missing audio or segmentIndex' }, { status: 400 });
  }

  const { data: meeting } = await supabase
    .from('meetings')
    .select('org_id, audio_segments')
    .eq('id', params.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  const r2Key = `${meeting.org_id || 'default'}/${params.id}/segment_${segmentIndex}.webm`;

  const { error: uploadError } = await supabase.storage
    .from('meeting-audio')
    .upload(r2Key, audioFile, {
      contentType: 'audio/webm',
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const segments = meeting.audio_segments || [];
  segments.push({
    r2_key: r2Key,
    segment_index: segmentIndex,
    duration_s: 0,
    status: 'uploading',
  });

  await supabase
    .from('meetings')
    .update({ audio_segments: segments })
    .eq('id', params.id);

  return NextResponse.json({ ok: true, r2Key });
}
