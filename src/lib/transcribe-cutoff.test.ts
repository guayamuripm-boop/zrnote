import { describe, it, expect } from 'vitest';
import { transcribeCutoff, type SegmentOutcome } from '@/lib/processing';

// These tests exist because the bug they pin down was invisible in every other
// way: transcription "succeeded", the minute was generated, the meeting showed
// as completed — and a few minutes of what was said had been dropped on the
// floor. Nothing logged it and nothing in the UI hinted at it.

const ok = (text: string): SegmentOutcome => ({ text });
const permanent = (error: string): SegmentOutcome => ({ text: null, error, permanent: true });
const recoverable = (error: string): SegmentOutcome => ({ text: null, error, permanent: false });

describe('transcribeCutoff', () => {
  it('advances past every segment when they all transcribed', () => {
    expect(transcribeCutoff([ok('a'), ok('b'), ok('c')])).toBe(3);
  });

  it('advances past silence and unreadable audio — retrying those never helps', () => {
    const outcomes = [
      ok('a'),
      permanent('SIN_VOZ: no se detectó voz audible en este fragmento'),
      permanent('AUDIO_FORMATO_NO_SOPORTADO: contenedor ilegible'),
      ok('d'),
    ];
    expect(transcribeCutoff(outcomes)).toBe(4);
  });

  it('STOPS at a rate-limited segment instead of skipping it', () => {
    // The regression. `offset + attempted` returned 3 here, so segment 1 was
    // never transcribed and never retried: that minute of the meeting simply
    // ceased to exist.
    const outcomes = [ok('a'), recoverable('Groq HTTP 429: rate limit'), ok('c')];
    expect(transcribeCutoff(outcomes)).toBe(1);
  });

  it('stops at a server error or a dropped connection too', () => {
    expect(transcribeCutoff([ok('a'), recoverable('Groq HTTP 502')])).toBe(1);
    expect(transcribeCutoff([recoverable('descarga fallida: timeout')])).toBe(0);
  });

  it('treats an unclassified failure as recoverable', () => {
    // Defaulting the other way would re-introduce the data loss through any
    // future code path that forgets to set the flag.
    expect(transcribeCutoff([ok('a'), { text: null, error: 'algo raro' }])).toBe(1);
  });

  it('keeps the segments before a recoverable failure', () => {
    const outcomes = [ok('a'), ok('b'), recoverable('429'), ok('d'), ok('e')];
    const cut = transcribeCutoff(outcomes);
    // Everything before the cut is written to the transcript; the rest is
    // re-attempted on the next call, in order, with nothing duplicated.
    expect(outcomes.slice(0, cut).map((o) => o.text)).toEqual(['a', 'b']);
  });

  it('returns 0 for an empty batch', () => {
    expect(transcribeCutoff([])).toBe(0);
  });
});
