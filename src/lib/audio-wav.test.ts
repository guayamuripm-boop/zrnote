import { describe, it, expect } from 'vitest';
import { encodeWavMono16, chunkFloatToWav } from '@/lib/audio-wav';

async function bytesOf(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}

describe('encodeWavMono16', () => {
  it('writes a valid RIFF/WAVE header for 16 kHz mono', async () => {
    const blob = encodeWavMono16(new Float32Array([0, 0.5, -0.5, 1, -1]), 16000);
    const v = await bytesOf(blob);
    const str = (o: number, n: number) =>
      String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(o + i)));
    expect(str(0, 4)).toBe('RIFF');
    expect(str(8, 4)).toBe('WAVE');
    expect(str(12, 4)).toBe('fmt ');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000); // sample rate
    expect(v.getUint16(34, true)).toBe(16); // bits
    expect(str(36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(5 * 2); // 5 samples * 2 bytes
  });

  it('clamps and quantizes samples to 16-bit', async () => {
    const v = await bytesOf(encodeWavMono16(new Float32Array([1, -1, 0]), 16000));
    expect(v.getInt16(44, true)).toBe(0x7fff); // +1 → max
    expect(v.getInt16(46, true)).toBe(-0x8000); // -1 → min
    expect(v.getInt16(48, true)).toBe(0); // 0 → 0
  });

  it('total size is 44-byte header + 2 bytes/sample', () => {
    const blob = encodeWavMono16(new Float32Array(1000), 16000);
    expect(blob.size).toBe(44 + 1000 * 2);
  });
});

describe('chunkFloatToWav', () => {
  it('keeps a small buffer as one chunk', () => {
    const blobs = chunkFloatToWav(new Float32Array(100), 16000, 1_000_000);
    expect(blobs).toHaveLength(1);
  });

  it('splits large buffers so every chunk stays under the cap', () => {
    // 100k samples = 200KB PCM; cap 50KB → several chunks, each ≤ 50KB.
    const blobs = chunkFloatToWav(new Float32Array(100_000), 16000, 50_000);
    expect(blobs.length).toBeGreaterThan(1);
    for (const b of blobs) expect(b.size).toBeLessThanOrEqual(50_000);
    // No samples lost: sum of payloads equals the original.
    const totalPayload = blobs.reduce((a, b) => a + (b.size - 44), 0);
    expect(totalPayload).toBe(100_000 * 2);
  });

  it('never returns zero chunks', () => {
    expect(chunkFloatToWav(new Float32Array(0), 16000, 1000)).toHaveLength(1);
  });
});
