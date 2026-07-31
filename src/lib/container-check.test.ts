import { describe, it, expect } from 'vitest';
import { looksLikeContainer } from './audio-conversion';

/**
 * This guard is what stops a silently-malformed file from reaching Groq.
 *
 * Context: a real meeting uploaded 15 raw ADTS `.aac` segments and EVERY one
 * came back `400 file must be one of the following types`. Groq validates the
 * actual content, so raw AAC has to be re-muxed into a real container before
 * upload — and ffmpeg does not always fail loudly when a stream copy cannot
 * produce a valid one.
 */

const bytesOf = (...parts: (string | number[])[]) => {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === 'string') out.push(...[...p].map((c) => c.charCodeAt(0)));
    else out.push(...p);
  }
  // Pad past the 2048-byte threshold the caller uses.
  while (out.length < 3000) out.push(0);
  return new Uint8Array(out);
};

describe('looksLikeContainer', () => {
  it('acepta un MP4/M4A real (caja ftyp)', () => {
    const mp4 = bytesOf([0, 0, 0, 0x20], 'ftypM4A ');
    expect(looksLikeContainer(mp4, 'm4a')).toBe(true);
    expect(looksLikeContainer(mp4, 'mp4')).toBe(true);
  });

  it('RECHAZA AAC crudo disfrazado de m4a — el bug original', () => {
    // 0xFFF1 es la palabra de sincronía ADTS: exactamente lo que había en
    // storage y lo que Groq rechazaba.
    const adts = bytesOf([0xff, 0xf1, 0x50, 0x40, 0x23, 0xbf]);
    expect(looksLikeContainer(adts, 'm4a')).toBe(false);
  });

  it('acepta MP3 con etiqueta ID3 y con sync de trama', () => {
    expect(looksLikeContainer(bytesOf('ID3', [3, 0, 0]), 'mp3')).toBe(true);
    expect(looksLikeContainer(bytesOf([0xff, 0xfb, 0x90, 0x00]), 'mp3')).toBe(true);
  });

  it('acepta WAV sólo si trae RIFF y WAVE', () => {
    expect(looksLikeContainer(bytesOf('RIFF', [0, 0, 0, 0], 'WAVE'), 'wav')).toBe(true);
    expect(looksLikeContainer(bytesOf('RIFF', [0, 0, 0, 0], 'AVI '), 'wav')).toBe(false);
  });

  it('acepta OGG y WebM por sus firmas', () => {
    expect(looksLikeContainer(bytesOf('OggS'), 'ogg')).toBe(true);
    expect(looksLikeContainer(bytesOf([0x1a, 0x45, 0xdf, 0xa3]), 'webm')).toBe(true);
  });

  it('rechaza contenido vacío o basura', () => {
    expect(looksLikeContainer(new Uint8Array([0, 0]), 'm4a')).toBe(false);
    expect(looksLikeContainer(bytesOf('NOPE'), 'ogg')).toBe(false);
  });

  it('no bloquea formatos que no sabe comprobar', () => {
    expect(looksLikeContainer(bytesOf('cualquiera'), 'flac')).toBe(true);
  });
});
