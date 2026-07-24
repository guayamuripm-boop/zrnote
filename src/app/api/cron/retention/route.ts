import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const AUDIO_RETENTION_DAYS = 30;
const MEETING_ARCHIVE_DAYS = 365;

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  const audioCutoff = new Date();
  audioCutoff.setDate(audioCutoff.getDate() - AUDIO_RETENTION_DAYS);

  const archiveCutoff = new Date();
  archiveCutoff.setDate(archiveCutoff.getDate() - MEETING_ARCHIVE_DAYS);

  // 1. Delete old audio files from storage
  const { data: oldMeetings } = await supabase
    .from('meetings')
    .select('id, audio_segments')
    .lt('created_at', audioCutoff.toISOString())
    .not('audio_segments', 'is', null);

  let deletedFiles = 0;
  let deletedSegments = 0;

  if (oldMeetings) {
    for (const meeting of oldMeetings) {
      const segments = meeting.audio_segments || [];
      const storageKeys = segments.map((s: any) => s.r2_key).filter(Boolean);

      if (storageKeys.length > 0) {
        const { error } = await supabase.storage
          .from('meeting-audio')
          .remove(storageKeys);
        
        if (!error) {
          deletedFiles += storageKeys.length;
        }
      }

      // Clear audio_segments from DB
      const { error: updateError } = await supabase
        .from('meetings')
        .update({ audio_segments: [], transcript_raw: null })
        .eq('id', meeting.id);

      if (!updateError) {
        deletedSegments += segments.length;
      }
    }
  }

  // 2. Archive old completed meetings (mark as archived, keep data)
  const { data: archivedMeetings, error: archiveError } = await supabase
    .from('meetings')
    .update({ archived: true })
    .eq('status', 'completed')
    .lt('created_at', archiveCutoff.toISOString())
    .select('id');

  // 3. Clean up expired rate limits
  await supabase
    .from('rate_limits')
    .delete()
    .lt('reset_at', new Date().toISOString());

  // 4. Clean up stuck processing queue items (> 1 hour old)
  const staleCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabase
    .from('processing_queue')
    .delete()
    .or(`status.eq.pending,status.eq.running`)
    .lt('created_at', staleCutoff);

  // 5. Clean up orphaned storage files (files not referenced in any meeting)
  // This is a safety net - list all files and check against DB
  const { data: allFiles } = await supabase.storage
    .from('meeting-audio')
    .list('', { limit: 10000 });

  if (allFiles) {
    const { data: allSegments } = await supabase
      .from('meetings')
      .select('audio_segments');

    const referencedKeys = new Set<string>();
    for (const m of allSegments || []) {
      for (const s of m.audio_segments || []) {
        if (s.r2_key) referencedKeys.add(s.r2_key);
      }
    }

    for (const file of allFiles) {
      if (!referencedKeys.has(file.name)) {
        await supabase.storage.from('meeting-audio').remove([file.name]);
      }
    }
  }

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

  return NextResponse.json({
    ok: true,
    deletedAudioFiles: deletedFiles,
    clearedSegments: deletedSegments,
    archivedMeetings: archivedMeetings?.length || 0,
    reminders,
    errors: archiveError ? [archiveError.message] : [],
  });
}