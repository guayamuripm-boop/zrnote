import { logger } from '@/lib/logger';

export interface AudioSegmentRow {
  r2_key: string;
  segment_index: number;
  duration_s: number;
  status: string;
  speaker_hint: string | null;
}

/**
 * Record an uploaded audio segment on a meeting.
 *
 * Two callers write this list — the segmented recorder and the whole-file
 * upload — and both used to do it the same unsafe way: SELECT the JSONB array,
 * splice the new entry in, UPDATE the whole array back. Between the SELECT and
 * the UPDATE, any other writer's entry is lost. The file stays in Storage and
 * nothing points at it, so that minute of the meeting is simply missing from
 * the transcript, with no error anywhere.
 *
 * Concurrency there is not hypothetical: the Chrome extension uses the same
 * route, and a durable upload queue means an interrupted recording can end up
 * being drained by two tabs of the same phone at once.
 *
 * Migration 027 moves the splice into a single SQL statement, where Postgres's
 * row lock serialises it for us. The fallback below keeps the old path alive
 * for the window where the code is deployed and the migration is not yet
 * applied — so the two can be rolled out in either order.
 */
export async function registerAudioSegment(
  supabase: any,
  meetingId: string,
  segment: AudioSegmentRow,
  /** The array as it was read earlier in the request, for the fallback path. */
  existing: AudioSegmentRow[],
): Promise<{ error: string | null }> {
  const { error: rpcError } = await supabase.rpc('append_audio_segment', {
    p_meeting_id: meetingId,
    p_segment: segment,
  });

  if (!rpcError) return { error: null };

  // PGRST202 = the function is not in the schema cache, i.e. migration 027 has
  // not been applied yet. Anything else is a real failure and must surface:
  // reporting success on a lost write is what leaves orphaned audio behind.
  const missing =
    rpcError.code === 'PGRST202' ||
    /could not find the function|does not exist/i.test(rpcError.message || '');

  if (!missing) {
    return { error: rpcError.message || 'No se pudo registrar el fragmento' };
  }

  logger.warn('append_audio_segment RPC unavailable, using read-modify-write', { meetingId });

  const filtered = (existing || []).filter((s) => s.segment_index !== segment.segment_index);
  filtered.push(segment);
  // The transcript is assembled in array order, so the array must stay sorted
  // by segment_index — re-uploading a chunk used to push it to the end and
  // scramble the transcript.
  filtered.sort((a, b) => (a.segment_index ?? 0) - (b.segment_index ?? 0));

  const { error } = await supabase
    .from('meetings')
    .update({ audio_segments: filtered })
    .eq('id', meetingId);

  return { error: error?.message ?? null };
}
