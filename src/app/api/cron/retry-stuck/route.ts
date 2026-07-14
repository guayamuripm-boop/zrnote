import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const STALE_PROCESSING_MS = 10 * 60 * 1000;

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  // Find meetings stuck in processing or failed that should be retried
  const { data: stuckMeetings, error } = await supabase
    .from('meetings')
    .select('id, status, ended_at, transcript_raw')
    .or(`status.eq.processing,status.eq.failed`);

  if (error) {
    console.error('[cron/retry-stuck] Error fetching meetings:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!stuckMeetings || stuckMeetings.length === 0) {
    return NextResponse.json({ ok: true, retried: 0 });
  }

  let retried = 0;

  for (const meeting of stuckMeetings) {
    const isStale = meeting.ended_at && Date.now() - new Date(meeting.ended_at).getTime() > STALE_PROCESSING_MS;
    const isFailed = meeting.status === 'failed';
    
    if (isStale || isFailed) {
      // Determine next step based on what's already done
      let nextStep = 'transcribe';
      if (meeting.transcript_raw && meeting.transcript_raw.trim().length > 0) {
        nextStep = 'analyze';
        // Check if minute exists
        const { data: minute } = await supabase
          .from('minutes')
          .select('id')
          .eq('meeting_id', meeting.id)
          .single();
        if (minute) {
          nextStep = 'emails';
        }
      }

      const { error: updateError } = await supabase
        .from('meetings')
        .update({ status: 'processing', ended_at: new Date().toISOString() })
        .eq('id', meeting.id);

      if (!updateError) {
        // Trigger the processing step
        fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app'}/api/meetings/${meeting.id}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: nextStep }),
        }).catch(() => {});

        retried++;
        console.log(`[cron/retry-stuck] Retried meeting ${meeting.id} from step ${nextStep}`);
      }
    }
  }

  return NextResponse.json({ ok: true, retried });
}