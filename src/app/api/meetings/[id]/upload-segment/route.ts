import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/api-auth';
import { registerAudioSegment } from '@/lib/audio-segments';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { serverError } from '@/lib/api-errors';
import { checkRateLimit } from '@/lib/rate-limiter';

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
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  // Cookie (web app) or bearer token (Chrome extension).
  const auth = await getAuthedUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { user, supabase } = auth;

  // Generous: a durable offline queue drains in bursts. This only stops floods.
  const { allowed } = await checkRateLimit(`upload:${user.id}`, { max: 120 });
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiadas subidas seguidas. Espera un momento.' }, { status: 429, headers: { 'Retry-After': '30' } });
  }

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
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  const r2Key = `${meeting.org_id || 'default'}/${resolvedParams.id}/segment_${segmentIndex}.${ext}`;

  const serviceClient = getSupabaseAdmin();

  const { error: uploadError } = await serviceClient.storage
    .from('meeting-audio')
    .upload(r2Key, audioFile, {
      contentType: audioFile.type || 'audio/webm',
      upsert: true,
    });

  if (uploadError) {
    return serverError('meetings/[id]/upload-segment', uploadError);
  }

  // Atomic where migration 027 is applied, read-modify-write where it is not.
  const { error: saveError } = await registerAudioSegment(
    supabase,
    resolvedParams.id,
    {
      r2_key: r2Key,
      segment_index: segmentIndex,
      duration_s: durationSec || 0,
      status: 'uploaded',
      speaker_hint: speakerHint || null,
    },
    meeting.audio_segments || [],
  );

  // The client retries on a non-2xx, so a lost write must NOT report success —
  // otherwise the segment file exists in Storage but nothing points to it.
  if (saveError) {
    return NextResponse.json({ error: saveError }, { status: 500 });
  }

  return NextResponse.json({ ok: true, r2Key });
}
