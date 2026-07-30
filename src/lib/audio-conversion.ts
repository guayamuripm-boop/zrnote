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
export async function segmentAudioNoReencode(
  file: File,
  secondsPerChunk: number,
  onProgress?: (percent: number) => void,
): Promise<File[]> {
  const ffmpeg = await loadFFmpeg();

  const ext = (file.name.split('.').pop() || 'm4a').toLowerCase().replace(/[^a-z0-9]/g, '') || 'm4a';
  const inputName = `seg_input.${ext}`;
  const pattern = `seg_out_%04d.${ext}`;
  const base = file.name.replace(/\.[^.]+$/, '');

  const onProgressHandler = ({ progress }: { progress: number }) =>
    onProgress?.(Math.min(100, Math.round(progress * 100)));
  ffmpeg.on('progress', onProgressHandler);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec([
      '-i', inputName,
      '-f', 'segment',
      '-segment_time', String(secondsPerChunk),
      '-reset_timestamps', '1',
      '-c', 'copy',
      '-y',
      pattern,
    ]);

    const entries = await ffmpeg.listDir('/');
    const names = entries
      .filter((e: any) => !e.isDir && /^seg_out_\d{4}\./.test(e.name))
      .map((e: any) => e.name)
      .sort();

    if (names.length === 0) throw new Error('FFmpeg no produjo segmentos');

    const out: File[] = [];
    for (let i = 0; i < names.length; i++) {
      const data = await ffmpeg.readFile(names[i]);
      const blob = new Blob([data as unknown as ArrayBuffer], { type: file.type || 'audio/mp4' });
      // Skip degenerate trailing segments (a few bytes of container padding).
      if (blob.size > 2048) {
        out.push(new File([blob], `${base}_part${i + 1}.${ext}`, { type: blob.type }));
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