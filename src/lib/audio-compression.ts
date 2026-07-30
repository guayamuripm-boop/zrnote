import { logger } from '@/lib/logger';

export interface CompressionOptions {
  targetBitrate?: number;
  mimeType?: string;
  maxDurationSec?: number;
}

interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  durationSec: number;
}

async function compressAudioBlob(
  audioBlob: Blob,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    targetBitrate = 32000,
    mimeType = 'audio/webm;codecs=opus',
    maxDurationSec,
  } = options;

  const originalSize = audioBlob.size;

  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  let duration = audioBuffer.duration;
  if (maxDurationSec && duration > maxDurationSec) {
    duration = maxDurationSec;
  }

  const compressedBlob = await new Promise<Blob>((resolve, reject) => {
    try {
      const stream = audioContext.createMediaStreamDestination();
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(stream);
      source.start(0);

      const mediaRecorder = new MediaRecorder(stream.stream, {
        mimeType,
        audioBitsPerSecond: targetBitrate,
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      };

      mediaRecorder.onerror = (e) => reject(e);
      mediaRecorder.start(1000);

      setTimeout(() => {
        mediaRecorder.stop();
        source.stop();
        audioContext.close().catch(() => {});
      }, (duration + 0.5) * 1000);
    } catch (e) {
      reject(e);
    }
  });

  const compressedSize = compressedBlob.size;
  const ratio = originalSize / compressedSize;

  return {
    blob: compressedBlob,
    originalSize,
    compressedSize,
    compressionRatio: ratio,
    durationSec: duration,
  };
}

export async function maybeCompressAudio(audioBlob: Blob, maxSizeMB = 2): Promise<Blob> {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (audioBlob.size <= maxSizeBytes) {
    return audioBlob;
  }

  logger.info('Comprimiendo audio', { sizeMB: (audioBlob.size / 1024 / 1024).toFixed(1), targetBitrate: 32000 });

  try {
    const result = await compressAudioBlob(audioBlob, { targetBitrate: 32000 });
    logger.info('Audio comprimido', { originalMB: (result.originalSize / 1024 / 1024).toFixed(1), compressedMB: (result.compressedSize / 1024 / 1024).toFixed(1), ratio: result.compressionRatio.toFixed(1) });
    return result.blob;
  } catch (e) {
    logger.warn('Fallo compresión, subiendo original', { error: String(e) });
    return audioBlob;
  }
}
