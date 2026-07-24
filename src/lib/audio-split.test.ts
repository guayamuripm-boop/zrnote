import { describe, it, expect } from 'vitest';
import { splitAdtsAac } from '@/lib/audio-split';

// Build a synthetic ADTS frame of a given total length (header + payload),
// encoding a specific sampling_frequency_index (default 4 = 44100 Hz).
function makeAdtsFrame(len: number, sfIndex = 4): Uint8Array {
  const f = new Uint8Array(len);
  f[0] = 0xff;
  f[1] = 0xf1; // sync + MPEG-4 + layer 0 + no CRC
  f[2] = 0x40 | ((sfIndex & 0x0f) << 2); // profile=01, sampling_frequency_index, private=0, chan-high=0
  // 13-bit frame length across byte3[1:0], byte4, byte5[7:5]
  f[3] = 0x40 | ((len >> 11) & 0x03);
  f[4] = (len >> 3) & 0xff;
  f[5] = ((len & 0x07) << 5) | 0x1f;
  f[6] = 0xfc;
  return f;
}

function concat(frames: Uint8Array[]): Uint8Array {
  const total = frames.reduce((a, f) => a + f.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const f of frames) { out.set(f, o); o += f.length; }
  return out;
}

describe('splitAdtsAac', () => {
  it('returns null for non-ADTS data', () => {
    expect(splitAdtsAac(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), { maxBytes: 1000 })).toBeNull();
    expect(splitAdtsAac(new Uint8Array(3), { maxBytes: 1000 })).toBeNull();
  });

  it('keeps a small stream as a single chunk', () => {
    const stream = concat([makeAdtsFrame(100), makeAdtsFrame(100), makeAdtsFrame(100)]);
    const chunks = splitAdtsAac(stream, { maxBytes: 10_000 })!;
    expect(chunks).toHaveLength(1);
    expect(chunks[0].frameCount).toBe(3);
    expect(chunks[0].bytes.length).toBe(300);
  });

  it('splits on frame boundaries under the byte cap', () => {
    // 10 frames of 100 bytes = 1000 bytes; cap 250 → chunks of ≤2 frames.
    const frames = Array.from({ length: 10 }, () => makeAdtsFrame(100));
    const chunks = splitAdtsAac(concat(frames), { maxBytes: 250 })!;
    let totalFrames = 0;
    let totalBytes = 0;
    for (const c of chunks) {
      expect(c.bytes.length).toBeLessThanOrEqual(250);
      expect(c.bytes[0]).toBe(0xff);
      expect(c.bytes[1] & 0xf0).toBe(0xf0);
      totalFrames += c.frameCount;
      totalBytes += c.bytes.length;
    }
    expect(totalFrames).toBe(10);
    expect(totalBytes).toBe(1000); // nothing lost or duplicated
  });

  it('stops cleanly on a truncated trailing frame', () => {
    // Two full frames + a partial one whose declared length overruns the buffer.
    const good = concat([makeAdtsFrame(100), makeAdtsFrame(100)]);
    const partial = makeAdtsFrame(100).subarray(0, 40); // header says 100, only 40 present
    const stream = concat([good, partial]);
    const chunks = splitAdtsAac(stream, { maxBytes: 10_000 })!;
    expect(chunks).toHaveLength(1);
    expect(chunks[0].frameCount).toBe(2); // partial frame dropped
    expect(chunks[0].bytes.length).toBe(200);
  });

  // --- Duration-based capping (the actual fix: prevents 504s from oversized
  // segments — a byte cap alone can still represent 10-20+ min of low-bitrate
  // voice audio, which blows the server's 60s function budget in one call).

  it('computes exact duration from the real sample rate (sfIndex=8 → 16000 Hz)', () => {
    // 16000 Hz, 1024 samples/frame → 1 frame = 0.064s. 50 frames = 3.2s.
    const frames = Array.from({ length: 50 }, () => makeAdtsFrame(50, 8));
    const chunks = splitAdtsAac(concat(frames), { maxBytes: 1_000_000 })!;
    expect(chunks).toHaveLength(1);
    expect(chunks[0].durationSec).toBeCloseTo(3.2, 5);
  });

  it('cuts chunks once the duration target is reached, independent of byte size', () => {
    // 16000 Hz: 1 frame = 0.064s. Target 1s → ~15.6 frames/chunk → cuts every 16 frames.
    const frames = Array.from({ length: 64 }, () => makeAdtsFrame(30, 8)); // tiny frames, byte cap irrelevant
    const chunks = splitAdtsAac(concat(frames), { maxBytes: 1_000_000, maxDurationSec: 1 })!;
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.durationSec).toBeLessThanOrEqual(1 + 0.064); // at most one frame over the target
    }
    const totalFrames = chunks.reduce((a, c) => a + c.frameCount, 0);
    expect(totalFrames).toBe(64);
  });

  it('a low-bitrate long recording still yields short-duration chunks (the real-world bug)', () => {
    // Simulate a low-bitrate voice recording: many small frames (small bytes,
    // long real duration at 16kHz) — this is exactly the shape that used to
    // produce a single 24MB/many-minute chunk under the old byte-only cap.
    const frames = Array.from({ length: 5000 }, () => makeAdtsFrame(20, 8)); // 100KB total, but long at 16kHz
    const totalDurationSec = (5000 * 1024) / 16000; // 320s (~5.3 min)
    const chunks = splitAdtsAac(concat(frames), { maxBytes: 24 * 1024 * 1024, maxDurationSec: 180 })!;
    // Byte cap alone (24MB) would never trigger here — duration cap must.
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.durationSec).toBeLessThanOrEqual(180 + 0.064);
    const sumDuration = chunks.reduce((a, c) => a + c.durationSec, 0);
    expect(sumDuration).toBeCloseTo(totalDurationSec, 1);
  });
});
