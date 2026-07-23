// Instant, decode-based re-chunking for formats the browser CAN decode
// (m4a, mp3, wav, ogg, webm). Unlike the old real-time MediaRecorder splitter
// (which played each segment back in real time — 40 min of audio took 40 min),
// this renders once with OfflineAudioContext and writes raw WAV, which is
// instantaneous. Target is 16 kHz mono — exactly what Whisper consumes — so the
// files stay small and every chunk is a valid, self-contained WAV.

const WAV_HEADER_BYTES = 44;

/** Encode mono PCM Float32 samples as a 16-bit WAV Blob. Pure (no browser APIs). */
export function encodeWavMono16(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, 1, true); // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (mono, 16-bit)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let o = WAV_HEADER_BYTES;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Split mono Float32 samples into WAV blobs each no larger than `maxBytes`,
 * cutting on sample boundaries. Pure (no browser APIs).
 */
export function chunkFloatToWav(samples: Float32Array, sampleRate: number, maxBytes: number): Blob[] {
  const maxSamples = Math.max(1, Math.floor((maxBytes - WAV_HEADER_BYTES) / 2));
  const blobs: Blob[] = [];
  for (let start = 0; start < samples.length; start += maxSamples) {
    blobs.push(encodeWavMono16(samples.subarray(start, start + maxSamples), sampleRate));
  }
  // An empty input still yields one (silent) chunk so callers get a stable shape.
  if (blobs.length === 0) blobs.push(encodeWavMono16(new Float32Array(0), sampleRate));
  return blobs;
}

/**
 * Decode any browser-decodable audio file to a single-channel Float32 buffer at
 * `targetRate` (16 kHz by default). Uses OfflineAudioContext so it renders far
 * faster than real time. Browser-only.
 */
export async function decodeToMono(
  file: File,
  targetRate = 16000,
): Promise<{ data: Float32Array; sampleRate: number }> {
  const AC: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ac = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await ac.decodeAudioData(await file.arrayBuffer());
  } finally {
    ac.close().catch(() => {});
  }

  const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const OAC: typeof OfflineAudioContext =
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const off = new OAC(1, frames, targetRate); // 1 channel → auto-downmix to mono
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return { data: rendered.getChannelData(0), sampleRate: targetRate };
}
