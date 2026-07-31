'use client';

import { useState, useCallback, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export interface ConversionOptions {
  targetFormat: 'mp3' | 'opus' | 'webm' | 'm4a';
  bitrateKbps: number;
  onProgress?: (progress: number) => void;
}

export interface ConversionResult {
  blob: Blob;
  file: File;
  durationSec: number;
  originalSize: number;
  convertedSize: number;
  compressionRatio: number;
}

// Self-hosted core (public/ffmpeg/*) — loading from a CDN is blocked by the app's
// CSP connect-src, and the single-thread UMD core has NO worker file, so we load
// only coreURL + wasmURL from the same origin. See next.config.js CSP (blob:).
const FFMPEG_BASE_URL = '/ffmpeg';

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    ffmpeg.on('log', ({ message }) => {
      console.debug('[FFmpeg]', message);
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return ffmpegLoadPromise;
}

/**
 * Split a long recording into fixed-duration chunks WITHOUT re-encoding
 * (`-c copy`), keeping the original container so every chunk stays a valid,
 * independently decodable file.
 *
 * This is the memory-safe path for long audio. The alternative — decoding the
 * whole file with the Web Audio API — allocates the entire recording as raw
 * PCM: a 2-hour 48kHz stereo file is ~2.7GB before it can be re-chunked, which
 * simply kills the tab on a phone. Stream-copying costs roughly the size of the
 * file itself and is close to instantaneous, because nothing is decoded.
 */
/**
 * Cheap magic-byte check that the bytes really are the container we asked for.
 *
 * Exported so it can be unit-tested: this is the guard that stops a silently
 * malformed file from reaching Groq, which is the failure mode that made every
 * `.aac` meeting fail with `400 file must be one of the following types`.
 */
export function looksLikeContainer(bytes: Uint8Array, ext: string): boolean {
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...bytes.slice(start, start + len));

  switch (ext) {
    case 'm4a':
    case 'mp4':
      // ISO-BMFF: a 4-byte size followed by the 'ftyp' box type.
      return bytes.length > 12 && ascii(4, 4) === 'ftyp';
    case 'mp3':
      // Either an ID3 tag or an MPEG audio frame sync (0xFFE).
      return (
        bytes.length > 3 &&
        (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))
      );
    case 'wav':
      return bytes.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE';
    case 'ogg':
      return bytes.length > 4 && ascii(0, 4) === 'OggS';
    case 'webm':
      // EBML header.
      return bytes.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    default:
      return true;
  }
}

export interface SegmentOptions {
  /** Container to write. Must be something Groq Whisper accepts. */
  outputExt?: 'm4a' | 'mp3' | 'wav' | 'ogg' | 'webm';
  /** Re-encode instead of stream-copying (needed when the source is exotic). */
  reencode?: boolean;
  onProgress?: (percent: number) => void;
}

async function runSegment(
  file: File,
  secondsPerChunk: number,
  outputExt: string,
  reencode: boolean,
  onProgress?: (percent: number) => void,
): Promise<File[]> {
  const ffmpeg = await loadFFmpeg();

  const inExt = (file.name.split('.').pop() || 'm4a').toLowerCase().replace(/[^a-z0-9]/g, '') || 'm4a';
  const inputName = `seg_input.${inExt}`;
  const pattern = `seg_out_%04d.${outputExt}`;
  const base = file.name.replace(/\.[^.]+$/, '');

  const onProgressHandler = ({ progress }: { progress: number }) =>
    onProgress?.(Math.min(100, Math.round(progress * 100)));
  ffmpeg.on('progress', onProgressHandler);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    const codecArgs = reencode
      ? outputExt === 'mp3'
        ? ['-c:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', '-ar', '16000']
        : ['-c:a', 'pcm_s16le', '-ac', '1', '-ar', '16000']
      : ['-c', 'copy'];

    // `-segment_format mp4` matters: without it the segment muxer infers the
    // format from the pattern and can emit raw streams instead of containers.
    const formatArgs =
      outputExt === 'm4a' ? ['-segment_format', 'mp4'] : outputExt === 'mp3' ? ['-segment_format', 'mp3'] : [];

    await ffmpeg.exec([
      '-i', inputName,
      '-vn',
      '-f', 'segment',
      '-segment_time', String(secondsPerChunk),
      ...formatArgs,
      '-reset_timestamps', '1',
      ...codecArgs,
      '-y',
      pattern,
    ]);

    const entries = await ffmpeg.listDir('/');
    const names = entries
      .filter((e: any) => !e.isDir && new RegExp(`^seg_out_\\d{4}\\.${outputExt}$`).test(e.name))
      .map((e: any) => e.name)
      .sort();

    if (names.length === 0) throw new Error('FFmpeg no produjo segmentos');

    const mime =
      outputExt === 'm4a' ? 'audio/mp4'
        : outputExt === 'mp3' ? 'audio/mpeg'
          : outputExt === 'wav' ? 'audio/wav'
            : `audio/${outputExt}`;

    const out: File[] = [];
    for (let i = 0; i < names.length; i++) {
      const data = (await ffmpeg.readFile(names[i])) as Uint8Array;
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as any);

      // Verify the container is real before shipping it. ffmpeg does not always
      // fail loudly — a stream copy into a container the codec cannot live in
      // can yield a file that is written but unreadable. Sending those to Groq
      // reproduces exactly the bug this whole path exists to fix, so check the
      // magic bytes here instead of finding out after the upload.
      if (bytes.length > 2048 && !looksLikeContainer(bytes, outputExt)) {
        throw new Error(`FFmpeg produjo un ${outputExt} que no es un contenedor válido`);
      }

      const blob = new Blob([bytes as unknown as ArrayBuffer], { type: mime });
      // Skip degenerate trailing segments (a few bytes of container padding).
      if (blob.size > 2048) {
        out.push(new File([blob], `${base}_part${i + 1}.${outputExt}`, { type: mime }));
      }
      await ffmpeg.deleteFile(names[i]).catch(() => {});
    }
    await ffmpeg.deleteFile(inputName).catch(() => {});

    if (out.length === 0) throw new Error('FFmpeg produjo segmentos vacíos');
    return out;
  } finally {
    ffmpeg.off('progress', onProgressHandler);
  }
}

/**
 * Split a long recording into fixed-duration chunks inside a container Groq
 * Whisper actually accepts.
 *
 * Groq's accepted list is [flac mp3 mp4 mpeg mpga m4a ogg opus wav webm] and it
 * enforces it on the real content, not just the filename: raw ADTS `.aac` from
 * a phone recorder is rejected with `400 file must be one of the following
 * types` no matter what extension or Content-Type you claim. (This code used to
 * upload those bytes verbatim and relabel them; every segment of every .aac
 * meeting failed.) Re-muxing into MP4/M4A keeps the exact same AAC audio — it
 * only wraps it — so it costs no quality and no decode time.
 *
 * Falls back to re-encoding as MP3 if the stream copy cannot produce a valid
 * container for that particular source.
 */
export async function segmentAudioNoReencode(
  file: File,
  secondsPerChunk: number,
  options: SegmentOptions = {},
): Promise<File[]> {
  const { outputExt = 'm4a', onProgress } = options;

  try {
    return await runSegment(file, secondsPerChunk, outputExt, false, onProgress);
  } catch (copyError) {
    console.warn('[ZRNote] Stream copy falló, re-codificando a MP3:', copyError);
    return runSegment(file, secondsPerChunk, 'mp3', true, onProgress);
  }
}

export function useAudioConverter() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  // FFmpeg (~31MB) is loaded LAZILY — only the first time convert() is actually
  // called (exotic formats). Never on mount, so opening the upload page costs 0.

  const convert = useCallback(
    async (file: File, options: ConversionOptions): Promise<ConversionResult> => {
      if (!ffmpegRef.current) {
        ffmpegRef.current = await loadFFmpeg();
      }
      const ffmpeg = ffmpegRef.current!;

      setLoading(true);
      setProgress(0);
      setError(null);

      const inputName = `input${file.name.substring(file.name.lastIndexOf('.')) || '.aac'}`;
      const outputExt = options.targetFormat;
      const outputName = `output.${outputExt}`;

      try {
        await ffmpeg.writeFile(inputName, await fetchFile(file));

        const bitrate = `${options.bitrateKbps}k`;
        const args = [
          '-i', inputName,
          '-c:a', outputExt === 'mp3' ? 'libmp3lame' : outputExt === 'opus' ? 'libopus' : outputExt === 'm4a' ? 'aac' : 'libopus',
          '-b:a', bitrate,
          '-y',
          outputName,
        ];

        // Registered per call, so it must also be removed per call — otherwise
        // every conversion stacks another listener on the shared instance.
        const onProgressHandler = ({ progress: p }: { progress: number }) => {
          const prog = Math.round(p * 100);
          setProgress(prog);
          options.onProgress?.(prog);
        };
        ffmpeg.on('progress', onProgressHandler);

        try {
          await ffmpeg.exec(args);
        } finally {
          ffmpeg.off('progress', onProgressHandler);
        }

        const data = await ffmpeg.readFile(outputName);
        const blob = new Blob([data as unknown as ArrayBuffer], { type: `audio/${outputExt === 'm4a' ? 'mp4' : outputExt}` });
        
        const convertedFile = new File(
          [blob],
          file.name.replace(/\.[^.]+$/, `.${outputExt}`),
          { type: blob.type }
        );

        const durationSec = await getAudioDuration(convertedFile);
        const originalSize = file.size;
        const convertedSize = blob.size;

        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);

        return {
          blob,
          file: convertedFile,
          durationSec,
          originalSize,
          convertedSize,
          compressionRatio: originalSize / convertedSize,
        };
      } catch (e: any) {
        const msg = e?.message || 'Error en conversión';
        setError(msg);
        throw new Error(msg);
      } finally {
        setLoading(false);
        setProgress(0);
      }
    },
    []
  );

  return { convert, loading, progress, error };
}

async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
      URL.revokeObjectURL(audio.src);
    };
    audio.onerror = () => resolve(0);
    audio.src = URL.createObjectURL(file);
  });
}

export async function estimateCompressedSize(
  durationSec: number,
  bitrateKbps: number
): Promise<number> {
  return Math.ceil((durationSec * bitrateKbps * 1000) / 8);
}