// R2 is no longer used - using Supabase Storage instead
// This file is kept for backwards compatibility

export function buildSegmentKey(orgId: string, meetingId: string, segmentIndex: number): string {
  return `${orgId}/${meetingId}/segment_${segmentIndex}.webm`;
}
