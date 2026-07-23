import { describe, it, expect } from 'vitest';
import { splitAdtsAac } from '@/lib/audio-split';

// Build a synthetic ADTS frame of a given total length (header + payload).
function makeAdtsFrame(len: number): Uint8Array {
  const f = new Uint8Array(len);
  f[0] = 0xff;
  f[1] = 0xf1; // sync + MPEG-4 + layer 0 + no CRC
  f[2] = 0x50;
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
    expect(splitAdtsAac(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), 1000)).toBeNull();
    expect(splitAdtsAac(new Uint8Array(3), 1000)).toBeNull();
  });

  it('keeps a small stream as a single chunk', () => {
    const stream = concat([makeAdtsFrame(100), makeAdtsFrame(100), makeAdtsFrame(100)]);
    const chunks = splitAdtsAac(stream, 10_000)!;
    expect(chunks).toHaveLength(1);
    expect(chunks[0].frameCount).toBe(3);
    expect(chunks[0].bytes.length).toBe(300);
  });

  it('splits on frame boundaries under the byte cap', () => {
    // 10 frames of 100 bytes = 1000 bytes; cap 250 → chunks of ≤2 frames.
    const frames = Array.from({ length: 10 }, () => makeAdtsFrame(100));
    const chunks = splitAdtsAac(concat(frames), 250)!;
    // Every chunk must be ≤ cap and start with a sync word (valid ADTS).
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
    const chunks = splitAdtsAac(stream, 10_000)!;
    expect(chunks).toHaveLength(1);
    expect(chunks[0].frameCount).toBe(2); // partial frame dropped
    expect(chunks[0].bytes.length).toBe(200);
  });
});
