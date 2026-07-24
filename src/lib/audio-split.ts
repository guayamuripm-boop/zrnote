// Lightweight, decode-free splitting for streamable audio (raw ADTS AAC).
//
// Why this exists: phone voice recorders often export raw .aac (ADTS). Chrome's
// decodeAudioData cannot decode it, and decoding a 40-min file in the browser
// would allocate hundreds of MB (mobile OOM). ADTS is a self-framing format —
// every frame carries its own header and length — so we can cut it at frame
// boundaries WITHOUT decoding. Each chunk is a valid, independently-decodable
// AAC stream that Groq Whisper accepts. Fast, memory-light, works on mobile.
//
// Chunks are capped by DURATION, not just byte size: `/api/meetings/[id]/process`
// runs with a 60s server function limit, and a byte-only cap (e.g. 24MB, Whisper's
// upload limit) can still represent 10-20+ minutes of low-bitrate voice audio —
// a single Whisper call for a chunk that long risks exceeding that 60s window
// and failing with a 504 Gateway Timeout. Duration is computed from the ADTS
// header's real sample rate (not guessed from bitrate), so the cap is exact
// regardless of how the file was encoded.

export interface AdtsChunk {
  bytes: Uint8Array;
  frameCount: number;
  durationSec: number;
}

// ADTS sampling_frequency_index (4 bits) → Hz. Standard MPEG-4 table (indices
// 13-15 are reserved/unused and never appear in real streams).
const ADTS_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
];
const SAMPLES_PER_FRAME = 1024; // one ADTS frame (1 raw_data_block) = 1024 PCM samples

export interface SplitAdtsOptions {
  maxBytes: number;
  /** Soft target: cut a chunk once it would exceed this many seconds. */
  maxDurationSec?: number;
}

/**
 * Split a raw ADTS AAC byte stream into chunks bounded by BOTH a byte cap
 * (Whisper's upload limit) and a duration cap (keeps a single server-side
 * transcription call fast), always cutting on a frame boundary so each chunk
 * stays independently decodable. Returns null if the input is not a valid
 * ADTS stream (caller should fall back to another strategy).
 */
export function splitAdtsAac(bytes: Uint8Array, options: SplitAdtsOptions): AdtsChunk[] | null {
  if (bytes.length < 7) return null;
  // First frame must start with the 12-bit sync word 0xFFF.
  if (bytes[0] !== 0xff || (bytes[1] & 0xf0) !== 0xf0) return null;

  const sfIndex = (bytes[2] >> 2) & 0x0f;
  const sampleRate = ADTS_SAMPLE_RATES[sfIndex] || 44100; // fallback for a reserved/unknown index
  const maxDurationSec = options.maxDurationSec ?? Infinity;
  const maxFramesByDuration = Math.max(1, Math.floor((maxDurationSec * sampleRate) / SAMPLES_PER_FRAME));

  // Walk every frame, recording its offset.
  const frames: number[] = [];
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

  const chunks: AdtsChunk[] = [];
  let chunkStart = frames[0];
  let chunkFrameCount = 0;

  const pushChunk = (endOffset: number) => {
    chunks.push({
      bytes: bytes.subarray(chunkStart, endOffset),
      frameCount: chunkFrameCount,
      durationSec: (chunkFrameCount * SAMPLES_PER_FRAME) / sampleRate,
    });
  };

  for (let f = 0; f < frames.length; f++) {
    const frameStart = frames[f];
    const frameEnd = f + 1 < frames.length ? frames[f + 1] : streamEnd;
    const frameLen = frameEnd - frameStart;

    const exceedsBytes = chunkFrameCount > 0 && frameStart - chunkStart + frameLen > options.maxBytes;
    const exceedsDuration = chunkFrameCount > 0 && chunkFrameCount + 1 > maxFramesByDuration;

    // Close the current chunk BEFORE adding this frame if either cap would be breached.
    if (exceedsBytes || exceedsDuration) {
      pushChunk(frameStart);
      chunkStart = frameStart;
      chunkFrameCount = 0;
    }
    chunkFrameCount++;
  }
  // Final chunk.
  pushChunk(streamEnd);

  return chunks;
}
