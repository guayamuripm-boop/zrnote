import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

/**
 * Recording consent for ONE meeting.
 *
 * In most of Latin America and the EU, recording a conversation without the
 * consent of every participant is a criminal offence — in Venezuela the Ley
 * sobre Protección a la Privacidad de las Comunicaciones sets 3-5 years of
 * prison. ZRNote cannot verify that consent was obtained, so the person who
 * presses record declares it explicitly and we keep a dated, attributable
 * record of that declaration.
 *
 * Accepts a cookie session (web app) or a bearer token (Chrome extension):
 * the gate has to apply to BOTH ways of recording, or it is not a gate.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user, supabase } = auth;

  const { data: meeting } = await supabase
    .from('meetings')
    .select('recording_consent_at, recording_consent_by')
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id)
    .maybeSingle();

  if (!meeting) return NextResponse.json({ error: 'Reunión no encontrada' }, { status: 404 });

  return NextResponse.json({
    consented: !!meeting.recording_consent_at,
    at: meeting.recording_consent_at,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user, supabase } = auth;

  const { data: meeting, error } = await supabase
    .from('meetings')
    .update({
      recording_consent_at: new Date().toISOString(),
      recording_consent_by: user.id,
    })
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id)
    .select('id, recording_consent_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!meeting) {
    return NextResponse.json({ error: 'Reunión no encontrada' }, { status: 404 });
  }

  logger.info('Recording consent confirmed', { meetingId: resolvedParams.id, userId: user.id });

  return NextResponse.json({ consented: true, at: meeting.recording_consent_at });
}
