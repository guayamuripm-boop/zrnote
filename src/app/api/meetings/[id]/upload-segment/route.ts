import { createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const ALLOWED_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp3': 'mp3',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/3gpp': '3gp',
};

const MAX_SIZE = 25 * 1024 * 1024; // 25MB Groq Whisper limit

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

  if (audioFile.size > MAX_SIZE) {
    return NextResponse.json({ error: `Archivo muy grande (${(audioFile.size / 1024 / 1024).toFixed(1)}MB). Máximo 25MB.` }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[audioFile.type] || audioFile.name.split('.').pop() || 'webm';

  const { data: meeting } = await supabase
    .from('meetings')
    .select('org_id, audio_segments')
    .eq('id', params.id)
    .eq('created_by', user.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  const r2Key = `${meeting.org_id || 'default'}/${params.id}/segment_${segmentIndex}.${ext}`;

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  const { error: uploadError } = await serviceClient.storage
    .from('meeting-audio')
    .upload(r2Key, audioFile, {
      contentType: audioFile.type || 'audio/webm',
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const segments = meeting.audio_segments || [];
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
