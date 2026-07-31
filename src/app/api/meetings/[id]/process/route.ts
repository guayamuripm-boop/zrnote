import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/api-auth';
import { z } from 'zod';
import { transcribeMeeting } from '@/lib/processing';
import { checkRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

const processSchema = z.object({
  step: z.enum(['transcribe', 'analyze', 'emails', 'vectorize']).optional(),
});

/**
 * Persist WHY a meeting failed instead of leaving the user with a generic
 * "falló". This used to be written into `transcript_raw`, which destroyed the
 * transcript and made the retry impossible.
 */
async function markFailed(supabase: any, meetingId: string, error: string) {
  await supabase
    .from('meetings')
    .update({ status: 'failed', error_message: error.slice(0, 1000) })
    .eq('id', meetingId);
}

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

  // Rate limiting per user per meeting (DB-based)
  const rateLimitKey = `${user.id}:${resolvedParams.id}:process`;
  const { allowed } = await checkRateLimit(rateLimitKey);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Demasiadas peticiones seguidas. Espera unos segundos.', retryAfterSec: 20 },
      { status: 429, headers: { 'Retry-After': '20' } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = processSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Paso inválido' }, { status: 400 });
  }

  let { step } = parsed.data;
  const meetingId = resolvedParams.id;

  const { data: meeting } = await supabase
    .from('meetings')
    .select('status, created_by, transcript_raw')
    .eq('id', meetingId)
    .eq('created_by', user.id)
    .maybeSingle();

  if (!meeting) {
    return NextResponse.json({ error: 'Reunión no encontrada' }, { status: 404 });
  }

  // Auto-detect the next step. `vectorize` is deliberately NOT part of the
  // automatic chain: it only feeds the (UI-less) RAG search, needs JINA_API_KEY
  // and the pgvector migration, and a failure there must never stop a user from
  // getting their minute. It stays callable explicitly.
  if (!step) {
    if (!meeting.transcript_raw || meeting.status === 'scheduled') {
      step = 'transcribe';
    } else {
      const { data: existingMinute } = await supabase
        .from('minutes')
        .select('id')
        .eq('meeting_id', meetingId)
        .maybeSingle();
      step = existingMinute ? 'emails' : 'analyze';
    }
  }

  if (meeting.status === 'completed' && step !== 'vectorize') {
    return NextResponse.json({ error: 'La reunión ya está completada' }, { status: 400 });
  }

  const validTransitions: Record<string, string[]> = {
    transcribe: ['scheduled', 'recording', 'failed', 'processing'],
    analyze: ['processing', 'failed'],
    emails: ['processing', 'failed'],
    vectorize: ['processing', 'failed', 'completed'],
  };

  const requiredStatus = validTransitions[step];
  if (requiredStatus && !requiredStatus.includes(meeting.status)) {
    return NextResponse.json({
      error: `Invalid status for step '${step}': ${meeting.status}`,
    }, { status: 400 });
  }

  if (step === 'transcribe') {
    const { error: updateError } = await supabase
      .from('meetings')
      .update({
        status: 'processing',
        error_message: null,
        ended_at: new Date().toISOString(),
      })
      .eq('id', meetingId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const result = await transcribeMeeting(meetingId);

    if (!result.success) {
      await markFailed(supabase, meetingId, result.error || 'Error al transcribir');
      return NextResponse.json({ ok: false, error: result.error, segmentsProcessed: result.segmentsProcessed, segmentsTotal: result.segmentsTotal });
    }

    // If more segments remain, return more:true so the frontend keeps polling
    return NextResponse.json({
      ok: true,
      more: result.more,
      transcriptLength: result.transcript?.length,
      segmentsProcessed: result.segmentsProcessed,
      segmentsTotal: result.segmentsTotal,
    });
  }

  if (step === 'analyze') {
    if (!meeting.transcript_raw) {
      return NextResponse.json({ ok: false, error: 'No hay transcripción todavía. Ejecuta primero la transcripción.' }, { status: 400 });
    }

    const { analyzeMeeting } = await import('@/lib/processing');
    const result = await analyzeMeeting(meetingId, meeting.transcript_raw);

    if (!result.success) {
      await markFailed(supabase, meetingId, result.error || 'Error al generar la minuta');
      return NextResponse.json({ ok: false, error: result.error });
    }

    return NextResponse.json({ ok: true, minuteId: result.minuteId, actionItemsCount: result.actionItemsCount });
  }

  if (step === 'emails') {
    const { sendMeetingEmails, markMeetingCompleted } = await import('@/lib/processing');

    // Guard: never mark a meeting "completed" if no minute was ever generated.
    // Otherwise a failed transcribe/analyze would silently end as a completed
    // meeting with "Minuta no disponible" — a false success.
    const { data: minute } = await supabase
      .from('minutes')
      .select('id')
      .eq('meeting_id', meetingId)
      .maybeSingle();

    if (!minute) {
      const msg = 'No se generó ninguna minuta: la transcripción o el análisis no produjeron resultado. Revisa que el audio tenga voz audible.';
      await markFailed(supabase, meetingId, msg);
      // `fatal` distinguishes "there is nothing to send" from "sending failed".
      // Without it the client downgrades this to a warning and tells the user
      // their minute is ready when it does not exist.
      return NextResponse.json({ ok: false, fatal: true, error: msg });
    }

    let emailResult;
    try {
      emailResult = await sendMeetingEmails(meetingId);
    } catch (err: any) {
      logger.error('Email step crashed', { meetingId, error: err?.message, stack: err?.stack });
      emailResult = { success: false, sent: 0, failed: 0, error: err?.message || 'Unknown error' };
    }

    if (!emailResult.success) {
      logger.error('Email send failed', { meetingId, error: emailResult.error });
    }

    // A minute exists, so the meeting IS done. E-mail trouble is reported but
    // never downgrades a good minute to "failed".
    await markMeetingCompleted(meetingId);

    return NextResponse.json({
      ok: true,
      emailsSent: emailResult.sent,
      emailsFailed: emailResult.failed,
      emailWarning: emailResult.success ? undefined : emailResult.error,
    });
  }

  if (step === 'vectorize') {
    const { vectorizeMeeting } = await import('@/lib/processing');

    const result = await vectorizeMeeting(meetingId);

    if (!result.success) {
      // Optional step: report it, but never flip the meeting to failed.
      logger.warn('Vectorize step failed (non-fatal)', { meetingId, error: result.error });
      return NextResponse.json({ ok: false, optional: true, error: result.error });
    }

    return NextResponse.json({ ok: true, chunksCreated: result.chunksCreated });
  }

  return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
}
