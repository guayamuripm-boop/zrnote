import { createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
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

  // Use service role for storage to bypass RLS on upsert (INSERT+UPDATE)
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { error: uploadError } = await serviceClient.storage
    .from('meeting-audio')
    .upload(r2Key, audioFile, {
      contentType: 'audio/webm',
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const segments = meeting.audio_segments || [];
  // Remove existing entry for this segment index (if re-uploading)
  const filtered = segments.filter((s: any) => s.segment_index !== segmentIndex);
  filtered.push({
    r2_key: r2Key,
    segment_index: segmentIndex,
    duration_s: 0,
    status: 'uploaded',
  });

  await supabase
    .from('meetings')
    .update({ audio_segments: filtered })
    .eq('id', params.id);

  return NextResponse.json({ ok: true, r2Key });
}
