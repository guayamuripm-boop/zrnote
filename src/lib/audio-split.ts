// Lightweight, decode-free splitting for streamable audio (raw ADTS AAC).
//
// Why this exists: phone voice recorders often export raw .aac (ADTS). Chrome's
// decodeAudioData cannot decode it, and decoding a 40-min file in the browser
// would allocate hundreds of MB (mobile OOM). ADTS is a self-framing format —
// every frame carries its own header and length — so we can cut it at frame
// boundaries WITHOUT decoding. Each chunk is a valid, independently-decodable
// AAC stream that Groq Whisper accepts. Fast, memory-light, works on mobile.

export interface AdtsChunk {
  bytes: Uint8Array;
  frameCount: number;
}

/**
 * Split a raw ADTS AAC byte stream into chunks no larger than `maxBytes`,
 * always cutting on a frame boundary so each chunk stays decodable.
 * Returns null if the input is not a valid ADTS stream (caller should fall back).
 */
export function splitAdtsAac(bytes: Uint8Array, maxBytes: number): AdtsChunk[] | null {
  if (bytes.length < 7) return null;
  // First frame must start with the 12-bit sync word 0xFFF.
  if (bytes[0] !== 0xff || (bytes[1] & 0xf0) !== 0xf0) return null;

  // Walk every frame, recording its offset and length.
  const frames: number[] = []; // frame start offsets
  let i = 0;
  while (i + 7 <= bytes.length) {
    if (bytes[i] !== 0xff || (bytes[i + 1] & 0xf0) !== 0xf0) {
      // Lost frame alignment before the end → not a clean ADTS stream.
      return null;
    }
    // 13-bit frame length: byte3[1:0] << 11 | byte4 << 3 | byte5[7:5]
    const frameLen =
      ((bytes[i + 3] & 0x03) << 11) | (bytes[i + 4] << 3) | ((bytes[i + 5] & 0xe0) >> 5);
    if (frameLen < 7) return null;
    if (i + frameLen > bytes.length) break; // truncated trailing frame — stop cleanly
    frames.push(i);
    i += frameLen;
  }

  if (frames.length === 0) return null;
  const streamEnd = i; // end of the last complete frame

  // A single frame larger than maxBytes cannot be honored.
  // (Never happens in practice: one AAC frame is <8KB.)
  const chunks: AdtsChunk[] = [];
  let chunkStart = frames[0];
  let chunkFrameCount = 0;

  for (let f = 0; f < frames.length; f++) {
    const frameStart = frames[f];
    const frameEnd = f + 1 < frames.length ? frames[f + 1] : streamEnd;
    const frameLen = frameEnd - frameStart;

    // If adding this frame would exceed the cap, close the current chunk first.
    if (chunkFrameCount > 0 && frameStart - chunkStart + frameLen > maxBytes) {
      chunks.push({ bytes: bytes.subarray(chunkStart, frameStart), frameCount: chunkFrameCount });
      chunkStart = frameStart;
      chunkFrameCount = 0;
    }
    chunkFrameCount++;
  }
  // Final chunk.
  chunks.push({ bytes: bytes.subarray(chunkStart, streamEnd), frameCount: chunkFrameCount });

  return chunks;
}
