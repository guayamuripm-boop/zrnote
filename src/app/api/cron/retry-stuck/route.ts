import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const STALE_PROCESSING_MS = 10 * 60 * 1000;
const EDGE_FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-meeting`;

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  // 1. Find meetings stuck in processing or failed that should be retried
  const { data: stuckMeetings, error } = await supabase
    .from('meetings')
    .select('id, status, ended_at, transcript_raw')
    .or(`status.eq.processing,status.eq.failed`);

  if (error) {
    logger.error('[cron/retry-stuck] Error fetching meetings', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. Find stuck processing_queue items (running > 10 min or pending > 30 min)
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const pendingCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: stuckQueueItems } = await supabase
    .from('processing_queue')
    .select('id, meeting_id, step, status, attempts, max_attempts, batch_offset, locked_at, created_at')
    .or(`status.eq.running.and(locked_at.lt.${stuckCutoff}),status.eq.pending.and(created_at.lt.${pendingCutoff})`);

  let retried = 0;

  // 3. Reset stuck queue items to pending
  if (stuckQueueItems && stuckQueueItems.length > 0) {
    for (const item of stuckQueueItems) {
      await supabase
        .from('processing_queue')
        .update({ 
          status: 'pending', 
          locked_at: null,
          attempts: Math.min(item.attempts, item.max_attempts - 1) // Allow one more retry
        })
        .eq('id', item.id);
      retried++;
      logger.info('[cron/retry-stuck] Reset stuck queue item', { queueId: item.id, meetingId: item.meeting_id, step: item.step });
    }
  }

  // 4. For meetings stuck without queue items, create queue entries
  if (stuckMeetings && stuckMeetings.length > 0) {
    for (const meeting of stuckMeetings) {
      const isStale = meeting.ended_at && Date.now() - new Date(meeting.ended_at).getTime() > STALE_PROCESSING_MS;
      const isFailed = meeting.status === 'failed';
      
      if (isStale || isFailed) {
        // Check if queue already has items for this meeting
        const { data: existingQueue } = await supabase
          .from('processing_queue')
          .select('id')
          .eq('meeting_id', meeting.id)
          .in('status', ['pending', 'running']);

        if (!existingQueue || existingQueue.length === 0) {
          // Determine next step by checking what's already been done
          let nextStep: 'transcribe' | 'analyze' | 'vectorize' | 'emails' = 'transcribe';
          if (meeting.transcript_raw && meeting.transcript_raw.trim().length > 0) {
            nextStep = 'analyze';
            const { data: minute } = await supabase
              .from('minutes')
              .select('id')
              .eq('meeting_id', meeting.id)
              .single();
            if (minute) {
              nextStep = 'vectorize';
              const { data: chunks } = await supabase
                .from('meeting_chunks')
                .select('id')
                .eq('meeting_id', meeting.id)
                .limit(1);
              if (chunks && chunks.length > 0) {
                nextStep = 'emails';
              }
            }
          }

          // Reset meeting status
          await supabase
            .from('meetings')
            .update({ status: 'processing', ended_at: new Date().toISOString() })
            .eq('id', meeting.id);

          // Create queue entry
          await supabase
            .from('processing_queue')
            .insert({
              meeting_id: meeting.id,
              step: nextStep,
              status: 'pending',
              attempts: 0,
              max_attempts: 5,
              batch_offset: 0,
            });

          retried++;
          logger.info('[cron/retry-stuck] Created queue entry for stuck meeting', { meetingId: meeting.id, step: nextStep });
        }
      }
    }
  }

  // 5. Trigger Edge Function to process queue (fire and forget)
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
    fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json' 
      },
    }).catch(() => {}); // Fire and forget
  } catch {}

  return NextResponse.json({ ok: true, retried, queueTriggered: true });
}