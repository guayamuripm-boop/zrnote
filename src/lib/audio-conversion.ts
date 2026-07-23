'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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

export function useAudioConverter() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  useEffect(() => {
    loadFFmpeg().then((ffmpeg) => {
      ffmpegRef.current = ffmpeg;
    }).catch((e) => {
      console.error('FFmpeg load failed:', e);
      setError('No se pudo cargar el convertidor de audio');
    });
  }, []);

  const convert = useCallback(
    async (file: File, options: ConversionOptions): Promise<ConversionResult> => {
      if (!ffmpegRef.current) {
        await loadFFmpeg();
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

        if (options.onProgress) {
          ffmpeg.on('progress', ({ progress: p }) => {
            const prog = Math.round(p * 100);
            setProgress(prog);
            options.onProgress?.(prog);
          });
        }

        await ffmpeg.exec(args);

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