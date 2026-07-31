import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/api-auth';

// A single /process call is capped at 60s server-side (vercel.json maxDuration),
// so if a step were genuinely in flight it resolves (success or failure) well
// within that. This guard only exists to avoid a true double-submit race; 90s
// is ample margin. It used to be 10 MINUTES, which turned any interrupted
// pipeline (closed tab, dropped network, backgrounded app) into a dead end —
// the user's own "Reintentar" click was blocked by this same lock for up to
// 10 minutes with no way to know when it would clear.
const STALE_PROCESSING_MS = 90 * 1000;

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

  const { data: meeting } = await supabase
    .from('meetings')
    .select('status, ended_at')
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  if (meeting.status === 'completed') {
    return NextResponse.json({ error: 'La reunión ya fue procesada' }, { status: 400 });
  }

  if (meeting.status === 'processing') {
    const startedAt = meeting.ended_at ? new Date(meeting.ended_at).getTime() : 0;
    const elapsedMs = Date.now() - startedAt;
    const isStale = elapsedMs > STALE_PROCESSING_MS;
    if (!isStale) {
      const waitSec = Math.ceil((STALE_PROCESSING_MS - elapsedMs) / 1000);
      return NextResponse.json({
        error: `La reunión parece estar procesándose todavía. Espera ${waitSec}s e inténtalo de nuevo.`,
        retryAfterSec: waitSec,
      }, { status: 400 });
    }
  }

  if (meeting.status === 'failed' || meeting.status === 'processing') {
    const { error } = await supabase
      .from('meetings')
      .update({
        status: 'processing',
        ended_at: new Date().toISOString(),
      })
      .eq('id', resolvedParams.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, nextStep: 'transcribe' });
  }

  const { error } = await supabase
    .from('meetings')
    .update({
      status: 'processing',
      ended_at: new Date().toISOString(),
    })
    .eq('id', resolvedParams.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, nextStep: 'transcribe' });
}