import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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

  // 3. Clean up orphaned storage files (files not referenced in any meeting)
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

  return NextResponse.json({
    ok: true,
    deletedAudioFiles: deletedFiles,
    clearedSegments: deletedSegments,
    archivedMeetings: archivedMeetings?.length || 0,
    errors: archiveError ? [archiveError.message] : [],
  });
}