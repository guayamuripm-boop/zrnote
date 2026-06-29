import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { uploadAudio, buildSegmentKey } from '@/lib/r2';

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

  const r2Key = buildSegmentKey(meeting.org_id, params.id, segmentIndex);
  const buffer = Buffer.from(await audioFile.arrayBuffer());

  await uploadAudio(r2Key, buffer, 'audio/webm');

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
