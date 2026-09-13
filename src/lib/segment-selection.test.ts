import { describe, it, expect } from 'vitest';
import { selectPendingSegments, advanceTranscribedIndex, type StoredAudioSegment } from '@/lib/processing';

// The bug these pin down is invisible from the outside: the transcript comes
// out with one minute of the meeting duplicated and a different minute
// missing, nothing logs a warning, and the meeting still reports success.

const seg = (segment_index: number): StoredAudioSegment => ({ segment_index, r2_key: `k${segment_index}.webm` });

describe('selectPendingSegments', () => {
  it('takes everything from the marker onwards, in index order', () => {
    const { batch, remaining } = selectPendingSegments([seg(0), seg(1), seg(2), seg(3)], 2, 10);
    expect(batch.map((s) => s.segment_index)).toEqual([2, 3]);
    expect(remaining).toBe(0);
  });

  it('caps the batch and reports what is left over', () => {
    const { batch, remaining } = selectPendingSegments([seg(0), seg(1), seg(2), seg(3), seg(4)], 0, 2);
    expect(batch.map((s) => s.segment_index)).toEqual([0, 1]);
    expect(remaining).toBe(3);
  });

  it('behaves identically to array slicing when there are no gaps', () => {
    // The compatibility guarantee: meetings already in flight, whose marker
    // was written under the old "array position" meaning, must not shift.
    const segments = [seg(0), seg(1), seg(2), seg(3), seg(4)];
    for (let marker = 0; marker <= 5; marker++) {
      const byIndex = selectPendingSegments(segments, marker, 99).batch;
      const bySlice = segments.slice(marker);
      expect(byIndex).toEqual(bySlice);
    }
  });

  it('does NOT re-transcribe a segment when a late upload shifts the array', () => {
    // Segment 5's upload kept failing while 6 and 7 landed, so 6 and 7 were
    // transcribed and the marker moved to 8. Now 5 finally arrives.
    const afterLateArrival = [seg(0), seg(1), seg(2), seg(3), seg(4), seg(5), seg(6), seg(7)];
    const { batch } = selectPendingSegments(afterLateArrival, 8, 10);
    // Under the old position-based slice this returned segment 7 — already
    // transcribed — and appended it to the transcript a second time.
    expect(batch).toEqual([]);
  });

  it('picks up a gap segment that arrives while the marker is still behind it', () => {
    // The good case: 5 lands before the marker passed it, so it is simply next.
    const { batch } = selectPendingSegments([seg(0), seg(5), seg(6)], 1, 10);
    expect(batch.map((s) => s.segment_index)).toEqual([5, 6]);
  });

  it('sorts out-of-order entries rather than trusting array order', () => {
    const { batch } = selectPendingSegments([seg(3), seg(1), seg(2)], 0, 10);
    expect(batch.map((s) => s.segment_index)).toEqual([1, 2, 3]);
  });
});

describe('advanceTranscribedIndex', () => {
  it('lands one past the last segment actually transcribed', () => {
    expect(advanceTranscribedIndex([seg(4), seg(5), seg(6)], 3, 4)).toBe(7);
  });

  it('stops at the recoverable failure, not past it', () => {
    // cut = 1 means only segment 4 was dealt with; 5 failed recoverably.
    expect(advanceTranscribedIndex([seg(4), seg(5), seg(6)], 1, 4)).toBe(5);
  });

  it('leaves the marker alone when nothing was transcribed', () => {
    expect(advanceTranscribedIndex([seg(4), seg(5)], 0, 4)).toBe(4);
  });

  it('skips over a hole instead of counting positions', () => {
    // Segments 4 and 9 exist, 5-8 never uploaded. Having done both, the
    // marker must be 10 — `nextIndex + cut` would have said 6, and then
    // re-transcribed 9 on the next pass, forever.
    expect(advanceTranscribedIndex([seg(4), seg(9)], 2, 4)).toBe(10);
  });

  it('never moves backwards', () => {
    expect(advanceTranscribedIndex([seg(1)], 1, 8)).toBe(8);
  });
});
