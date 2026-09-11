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

    const { data: removed, error } = await supabase.storage.from('meeting-audio').remove(storageKeys);
    if (error) {
      logger.error('Retention: could not remove audio', { meetingId: meeting.id, error: error.message });
      continue; // keep the DB pointing at the files so a later run can retry
    }

    // `remove()` reports an error only when the WHOLE call fails. Ask it for
    // ten keys, have it delete eight, and you get `error: null` — which this
    // code then took as licence to clear `audio_segments`, orphaning the other
    // two beyond any future cron's reach. So trust the RESPONSE, not the
    // request: only a full delete may clear the pointer.
    const removedCount = (removed || []).length;
    deletedFiles += removedCount;

    if (removedCount < storageKeys.length) {
      logger.warn('Retention: partial audio removal, keeping DB pointer', {
        meetingId: meeting.id,
        asked: storageKeys.length,
        removed: removedCount,
      });
      continue; // next run retries; the orphan sweep is the safety net
    }

    // Only the AUDIO expires. The transcript and the minute are what the user
    // actually keeps — wiping transcript_raw here (as this job used to) also
    // destroyed any chance of regenerating the minute.
    const { error: updateError } = await supabase
      .from('meetings')
      .update({ audio_segments: [] })
      .eq('id', meeting.id);

    if (!updateError) clearedMeetings++;
  }

  // 1b. Sweep audio that NO meeting points at any more.
  //
  // Step 1 above can only delete what it can see, and it looks at Storage
  // through the `meetings` table: for each old meeting, remove the keys listed
  // in its `audio_segments`. A file that nothing references is therefore
  // invisible to it and survives forever.
  //
  // That is not theoretical. The 11 Sep 2026 diagnosis found 90 MB across 165
  // files older than 30 days, with ZERO meetings older than 30 days still
  // pointing at audio — 165 files that belonged to nobody and were never going
  // to be collected, eating into a 1 GB allowance.
  //
  // They accumulate through several ordinary paths: `storage.remove()` takes a
  // list and only reports an error if the WHOLE call fails, so a partial
  // delete left step 1 happily clearing the DB pointer; an upload can reach
  // Storage and then fail to register in the database; a retry can store the
  // same segment under a different extension. Each one is rare. Together, over
  // months, they are a leak.
  //
  // Migration 028 asks the question the other way round — walk Storage, ask
  // the database who claims each file — which is the only way to see something
  // nothing points to. It is strictly read-only and never returns a file
  // younger than the retention window, so a just-uploaded segment whose
  // registration has not landed yet can never be mistaken for rubbish.
  let orphansDeleted = 0;
  let orphanBytes = 0;
  const { data: orphans, error: orphanError } = await supabase.rpc('list_orphan_audio', {
    p_older_than_days: AUDIO_RETENTION_DAYS,
    p_limit: 1000,
  });

  if (orphanError) {
    // Migration 028 not applied yet → behave exactly as before. Anything else
    // is worth knowing about, but must never abort the rest of the run.
    logger.warn('Retention: orphan sweep unavailable', { error: orphanError.message });
  } else if (orphans && orphans.length > 0) {
    const names = orphans.map((o: any) => o.name).filter(Boolean);
    orphanBytes = orphans.reduce((sum: number, o: any) => sum + (Number(o.size_bytes) || 0), 0);

    // In batches: one `remove()` call with a thousand keys is a long request
    // and an all-or-nothing outcome.
    for (let i = 0; i < names.length; i += 100) {
      const slice = names.slice(i, i + 100);
      const { data: removed, error } = await supabase.storage.from('meeting-audio').remove(slice);
      if (error) {
        logger.error('Retention: orphan sweep batch failed', { error: error.message, batch: i / 100 });
        continue;
      }
      // Count what Storage says it actually removed, not what we asked for —
      // trusting the request over the response is how the leak started.
      orphansDeleted += (removed || []).length;
    }

    logger.info('Retention: orphan audio swept', { found: names.length, orphansDeleted, orphanBytes });
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

  logger.info('Retention run finished', { deletedFiles, clearedMeetings, orphansDeleted, archived: archivedMeetings?.length || 0 });

  return NextResponse.json({
    ok: true,
    deletedAudioFiles: deletedFiles,
    orphanFilesDeleted: orphansDeleted,
    orphanBytesFreed: orphanBytes,
    clearedMeetings,
    archivedMeetings: archivedMeetings?.length || 0,
    reminders,
    errors: archiveError ? [archiveError.message] : [],
  });
}
