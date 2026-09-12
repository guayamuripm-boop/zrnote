import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/api-auth';

// Skip audio entirely: attach a transcript someone already has (Zoom's own
// export, Meet's captions, notes typed by hand) and let the SAME pipeline
// that reads recorded audio read this instead. `transcribeMeeting()` treats a
// meeting with no audio segments but a transcript already in place as "the
// transcribe step is already done" — see the comment there — so nothing
// downstream (`analyzeMeeting`, e-mails) needs to know or care where the text
// came from.
const MIN_LENGTH = 40;
const MAX_LENGTH = 200_000; // a few hours of speech, generously

const bodySchema = z.object({
  transcript: z.string().trim().min(MIN_LENGTH, `El texto es demasiado corto (mínimo ${MIN_LENGTH} caracteres).`).max(MAX_LENGTH),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const auth = await getAuthedUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { user, supabase } = auth;

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Texto inválido' }, { status: 400 });
  }

  const { data: meeting } = await supabase
    .from('meetings')
    .select('status, audio_segments')
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id)
    .maybeSingle();

  if (!meeting) {
    return NextResponse.json({ error: 'Reunión no encontrada' }, { status: 404 });
  }
  if (meeting.status === 'completed') {
    return NextResponse.json({ error: 'Esta reunión ya está completada' }, { status: 400 });
  }
  if ((meeting.audio_segments || []).length > 0) {
    return NextResponse.json(
      { error: 'Esta reunión ya tiene audio; una transcripción pegada a mano sustituiría la real. Usa una reunión nueva para esto.' },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from('meetings')
    .update({
      transcript_raw: parsed.data.transcript,
      status: 'processing',
      ended_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', resolvedParams.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
