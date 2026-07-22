import { createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// For audio formats the browser cannot decode/split client-side (e.g. raw .aac
// from voice recorders) we let the browser upload the whole file straight to
// Supabase Storage via a signed URL — this bypasses Vercel's 4.5MB request-body
// cap. Groq Whisper decodes aac/m4a/mp3/wav/ogg/webm server-side (25MB limit).
const MAX_DIRECT_SIZE = 25 * 1024 * 1024; // Groq Whisper hard limit

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const phase = body.phase as 'sign' | 'register' | undefined;

  const { data: meeting } = await supabase
    .from('meetings')
    .select('org_id, audio_segments')
    .eq('id', params.id)
    .eq('created_by', user.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  // Phase 1: hand the browser a signed URL it can upload the raw file to.
  if (phase === 'sign') {
    const segmentIndex = Number(body.segmentIndex);
    const size = Number(body.size) || 0;
    const ext = String(body.ext || 'aac').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'aac';

    if (!Number.isFinite(segmentIndex)) {
      return NextResponse.json({ error: 'segmentIndex requerido' }, { status: 400 });
    }
    if (size > MAX_DIRECT_SIZE) {
      return NextResponse.json({
        error: `Archivo muy grande (${(size / 1024 / 1024).toFixed(1)}MB). Máximo 25MB. Convierte a MP3/M4A o usa "Grabar" para audios largos.`,
      }, { status: 400 });
    }

    const key = `${meeting.org_id || 'default'}/${params.id}/segment_${segmentIndex}.${ext}`;
    const { data, error } = await service.storage
      .from('meeting-audio')
      .createSignedUploadUrl(key, { upsert: true });

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'No se pudo firmar la subida' }, { status: 500 });
    }
    return NextResponse.json({ path: key, token: data.token, signedUrl: data.signedUrl });
  }

  // Phase 2: after the browser finished uploading, record the segment metadata.
  if (phase === 'register') {
    const segmentIndex = Number(body.segmentIndex);
    const path = String(body.path || '');
    const durationSec = Number(body.durationSec) || 0;

    if (!Number.isFinite(segmentIndex) || !path) {
      return NextResponse.json({ error: 'segmentIndex y path requeridos' }, { status: 400 });
    }

    const segments = meeting.audio_segments || [];
    const filtered = segments.filter((s: any) => s.segment_index !== segmentIndex);
    filtered.push({
      r2_key: path,
      segment_index: segmentIndex,
      duration_s: durationSec,
      status: 'uploaded',
      speaker_hint: null,
    });

    const { error } = await supabase
      .from('meetings')
      .update({ audio_segments: filtered })
      .eq('id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'phase inválida (sign|register)' }, { status: 400 });
}
