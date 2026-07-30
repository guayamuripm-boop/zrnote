import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { assertCron } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Audio is the most sensitive thing we hold and the least useful once the
// minute exists. It is deleted after 30 days — this is stated in the privacy
// notice, so the two must stay in sync if you change the number.
const AUDIO_RETENTION_DAYS = 30;
const MEETING_ARCHIVE_DAYS = 365;

export async function GET(request: Request) {
  const denied = assertCron(request);
  if (denied) return denied;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  const audioCutoff = new Date();
  audioCutoff.setDate(audioCutoff.getDate() - AUDIO_RETENTION_DAYS);

  const archiveCutoff = new Date();
  archiveCutoff.setDate(archiveCutoff.getDate() - MEETING_ARCHIVE_DAYS);

  // 1. Delete old audio files from storage.
  const { data: oldMeetings } = await supabase
    .from('meetings')
    .select('id, audio_segments')
    .lt('created_at', audioCutoff.toISOString())
    .not('audio_segments', 'is', null);

  let deletedFiles = 0;
  let clearedMeetings = 0;

  for (const meeting of oldMeetings || []) {
    const segments = meeting.audio_segments || [];
    const storageKeys = segments.map((s: any) => s.r2_key).filter(Boolean);
    if (storageKeys.length === 0) continue;

    const { error } = await supabase.storage.from('meeting-audio').remove(storageKeys);
    if (error) {
      logger.error('Retention: could not remove audio', { meetingId: meeting.id, error: error.message });
      continue; // keep the DB pointing at the files so a later run can retry
    }
    deletedFiles += storageKeys.length;

    // Only the AUDIO expires. The transcript and the minute are what the user
    // actually keeps — wiping transcript_raw here (as this job used to) also
    // destroyed any chance of regenerating the minute.
    const { error: updateError } = await supabase
      .from('meetings')
      .update({ audio_segments: [] })
      .eq('id', meeting.id);

    if (!updateError) clearedMeetings++;
  }

  // 2. Archive very old completed meetings (kept, just flagged).
  const { data: archivedMeetings, error: archiveError } = await supabase
    .from('meetings')
    .update({ archived: true })
    .eq('status', 'completed')
    .lt('created_at', archiveCutoff.toISOString())
    .select('id');

  // 3. Expired rate limits.
  await supabase.from('rate_limits').delete().lt('reset_at', new Date().toISOString());

  // 4. Stale processing queue items (> 1 hour old).
  const staleCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabase
    .from('processing_queue')
    .delete()
    .in('status', ['pending', 'running'])
    .lt('created_at', staleCutoff);

  // Daily action-item reminders (piggybacked here — Vercel Hobby allows only 2
  // cron jobs, so we don't add a third). Never let a reminder failure break
  // retention.
  let reminders = { sent: 0, failed: 0 } as { sent: number; failed: number; skipped?: string };
  try {
    const { sendDueReminders } = await import('@/lib/reminders');
    reminders = await sendDueReminders();
  } catch (err: any) {
    reminders = { sent: 0, failed: 0, skipped: err?.message || 'reminders crashed' };
  }

  logger.info('Retention run finished', { deletedFiles, clearedMeetings, archived: archivedMeetings?.length || 0 });

  return NextResponse.json({
    ok: true,
    deletedAudioFiles: deletedFiles,
    clearedMeetings,
    archivedMeetings: archivedMeetings?.length || 0,
    reminders,
    errors: archiveError ? [archiveError.message] : [],
  });
}
