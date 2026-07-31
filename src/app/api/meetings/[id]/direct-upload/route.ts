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
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const phase = body.phase as 'begin' | 'sign' | 'register' | undefined;

  const { data: meeting } = await supabase
    .from('meetings')
    .select('org_id, audio_segments')
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  const existingSegments: any[] = meeting.audio_segments || [];

  // Phase 0: tell the browser where its numbering must start. Without this the
  // upload page always started at 0, so a SECOND upload to the same meeting
  // silently overwrote the segments of the first one.
  if (phase === 'begin') {
    const nextIndex = existingSegments.reduce(
      (max: number, s: any) => Math.max(max, Number(s.segment_index ?? -1) + 1),
      0,
    );
    return NextResponse.json({ nextIndex, existing: existingSegments.length });
  }

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

    const key = `${meeting.org_id || 'default'}/${resolvedParams.id}/segment_${segmentIndex}.${ext}`;
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

    const filtered = existingSegments.filter((s: any) => s.segment_index !== segmentIndex);
    filtered.push({
      r2_key: path,
      segment_index: segmentIndex,
      duration_s: durationSec,
      status: 'uploaded',
      speaker_hint: null,
    });
    // The transcript is assembled in array order, so the array must stay sorted
    // by segment_index — re-uploading a chunk used to push it to the end and
    // scramble the transcript.
    filtered.sort((a: any, b: any) => (a.segment_index ?? 0) - (b.segment_index ?? 0));

    const { error } = await supabase
      .from('meetings')
      .update({ audio_segments: filtered })
      .eq('id', resolvedParams.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'phase inválida (begin|sign|register)' }, { status: 400 });
}
