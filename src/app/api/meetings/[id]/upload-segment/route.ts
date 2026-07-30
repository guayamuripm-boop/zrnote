import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/api-auth';

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
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/aacp': 'aac',
  'audio/amr': 'amr',
};

// Vercel Serverless Functions reject any request body over 4.5MB at the
// platform level (FUNCTION_PAYLOAD_TOO_LARGE) before this handler even runs,
// regardless of Groq Whisper's own 25MB limit — so this must stay under 4.5MB.
const MAX_SIZE = 4 * 1024 * 1024; // 4MB, safely under Vercel's 4.5MB body cap

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  // Cookie (web app) or bearer token (Chrome extension).
  const auth = await getAuthedUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { user, supabase } = auth;

  const formData = await request.formData();
  const audioFile = formData.get('audio') as File;
  const segmentIndex = parseInt(formData.get('segmentIndex') as string, 10);
  const speakerHint = formData.get('speakerHint') as string | null;
  const durationSec = parseInt(formData.get('durationSec') as string, 10) || 0;

  if (!audioFile || isNaN(segmentIndex)) {
    return NextResponse.json({ error: 'Missing audio or segmentIndex' }, { status: 400 });
  }

  if (audioFile.size > MAX_SIZE) {
    return NextResponse.json({ error: `Archivo muy grande (${(audioFile.size / 1024 / 1024).toFixed(1)}MB). Máximo 4MB por archivo — para audios más largos usa "Grabar" en vez de subir un archivo.` }, { status: 400 });
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
    duration_s: durationSec || 0,
    status: 'uploaded',
    speaker_hint: speakerHint || null,
  });
  // Keep the array ordered: the transcript is concatenated in array order.
  filtered.sort((a: any, b: any) => (a.segment_index ?? 0) - (b.segment_index ?? 0));

  const { error: saveError } = await supabase
    .from('meetings')
    .update({ audio_segments: filtered })
    .eq('id', params.id);

  // The client retries on a non-2xx, so a lost write must NOT report success —
  // otherwise the segment file exists in Storage but nothing points to it.
  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, r2Key });
}
