import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { transcribeMeeting } from '@/lib/processing';
import { checkRateLimit, cleanupExpiredRateLimits } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

const processSchema = z.object({
  step: z.enum(['transcribe', 'analyze', 'emails', 'vectorize']).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limiting per user per meeting (DB-based)
  const rateLimitKey = `${user.id}:${params.id}:process`;
  const { allowed } = await checkRateLimit(rateLimitKey);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  const body = await request.json();
  const parsed = processSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let { step } = parsed.data;
  const meetingId = params.id;

  // Auto-detect next step if not specified
  if (!step) {
    const { data: detectMeeting } = await supabase
      .from('meetings')
      .select('status, transcript_raw')
      .eq('id', meetingId)
      .single();

    if (detectMeeting) {
      if (detectMeeting.status === 'failed' || detectMeeting.status === 'scheduled') {
        step = 'transcribe';
      } else if (!detectMeeting.transcript_raw) {
        step = 'transcribe';
      } else {
        // Check if minute exists
        const { data: existingMinute } = await supabase
          .from('minutes')
          .select('id')
          .eq('meeting_id', meetingId)
          .single();
        if (!existingMinute) {
          step = 'analyze';
        } else {
          // Check if already vectorized
          const { data: existingChunks } = await supabase
            .from('meeting_chunks')
            .select('id')
            .eq('meeting_id', meetingId)
            .limit(1);
          if (!existingChunks || existingChunks.length === 0) {
            step = 'vectorize';
          } else {
            step = 'emails';
          }
        }
      }
    }
  }

  const { data: meeting } = await supabase
    .from('meetings')
    .select('status, created_by, transcript_raw')
    .eq('id', meetingId)
    .eq('created_by', user.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  if (meeting.status === 'completed') {
    return NextResponse.json({ error: 'Meeting already completed' }, { status: 400 });
  }

  if (!step) {
    return NextResponse.json({ error: 'Could not determine next processing step' }, { status: 400 });
  }

  const validTransitions: Record<string, string[]> = {
    transcribe: ['scheduled', 'failed', 'processing'],
    analyze: ['processing', 'failed'],
    emails: ['processing', 'failed'],
    vectorize: ['processing', 'failed', 'completed'],
  };

  const requiredStatus = validTransitions[step];
  if (requiredStatus && !requiredStatus.includes(meeting.status)) {
    return NextResponse.json({ 
      error: `Invalid status for step '${step}': ${meeting.status}` 
    }, { status: 400 });
  }

  // Additional checks for retry from failed
  if (step === 'analyze' && meeting.status === 'failed' && !meeting.transcript_raw) {
    return NextResponse.json({ error: 'No transcript available. Run transcribe step first.' }, { status: 400 });
  }
  if (step === 'emails' && meeting.status === 'failed') {
    // Check if minute exists
    const { data: minute } = await supabase
      .from('minutes')
      .select('id')
      .eq('meeting_id', meetingId)
      .single();
    if (!minute) {
      return NextResponse.json({ error: 'No minute found. Run analyze step first.' }, { status: 400 });
    }
  }

  if (step === 'transcribe') {
    const { error: updateError } = await supabase
      .from('meetings')
      .update({ 
        status: 'processing', 
        ended_at: new Date().toISOString() 
      })
      .eq('id', meetingId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const result = await transcribeMeeting(meetingId);
    
    if (!result.success) {
      await supabase
        .from('meetings')
        .update({ status: 'failed' })
        .eq('id', meetingId);
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
      return NextResponse.json({ error: 'No transcript available. Run transcribe step first.' }, { status: 400 });
    }

    const { analyzeMeeting } = await import('@/lib/processing');
    const result = await analyzeMeeting(meetingId, meeting.transcript_raw);
    
    if (!result.success) {
      await supabase
        .from('meetings')
        .update({ status: 'failed' })
        .eq('id', meetingId);
      return NextResponse.json({ ok: false, error: result.error });
    }

    return NextResponse.json({ ok: true, minuteId: result.minuteId, actionItemsCount: result.actionItemsCount });
  }

  if (step === 'emails') {
    const { sendMeetingEmails, markMeetingCompleted } = await import('@/lib/processing');

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

    await markMeetingCompleted(meetingId);

    return NextResponse.json({ ok: true, emailsSent: emailResult.sent, emailsFailed: emailResult.failed });
  }

  if (step === 'vectorize') {
    const { vectorizeMeeting } = await import('@/lib/processing');
    
    const result = await vectorizeMeeting(meetingId);
    
    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.error });
    }

    return NextResponse.json({ ok: true, chunksCreated: result.chunksCreated });
  }

  return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
}