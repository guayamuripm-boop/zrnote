import { logger } from '@/lib/logger';

export interface CompressionOptions {
  targetBitrate?: number;      // kbps (default: 32kbps para voz)
  mimeType?: string;           // default: 'audio/webm;codecs=opus'
  maxDurationSec?: number;     // truncar si excede
}

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  durationSec: number;
}

export interface SplitOptions {
  segmentDurationSec?: number;  // default: 30s
  mimeType?: string;
  targetBitrate?: number;
}

export interface SplitResult {
  segments: Blob[];
  originalDurationSec: number;
  segmentDurationSec: number;
  numSegments: number;
}

/**
 * Comprime un Blob de audio usando MediaRecorder a bitrate objetivo
 * Funciona en navegador (requiere AudioContext + MediaRecorder)
 */
export async function compressAudioBlob(
  audioBlob: Blob,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    targetBitrate = 32000,        // 32 kbps - óptimo para voz
    mimeType = 'audio/webm;codecs=opus',
    maxDurationSec,
  } = options;

  const originalSize = audioBlob.size;

  // 1. Decode audio to AudioBuffer
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Truncate if needed
  let duration = audioBuffer.duration;
  if (maxDurationSec && duration > maxDurationSec) {
    const truncated = audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      maxDurationSec * audioBuffer.sampleRate,
      audioBuffer.sampleRate
    );
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      truncated.copyToChannel(audioBuffer.getChannelData(ch).subarray(0, maxDurationSec * audioBuffer.sampleRate), ch);
    }
    duration = maxDurationSec;
  }

  // 2. Re-encode with MediaRecorder at target bitrate
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
      mediaRecorder.start(1000); // chunk cada 1s

      // Stop after duration + small buffer
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

/**
 * Divide un archivo de audio largo en segmentos de duración fija (ej: 30s)
 * Usa Web Audio API para decodificar y MediaRecorder para re-codificar cada segmento
 */
export async function splitAudioFile(
  audioBlob: Blob,
  options: SplitOptions = {}
): Promise<SplitResult> {
  const {
    segmentDurationSec = 30,
    mimeType = 'audio/webm;codecs=opus',
    targetBitrate = 32000,
  } = options;

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  // Decode audio to AudioBuffer
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  const originalDurationSec = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const samplesPerSegment = segmentDurationSec * sampleRate;
  const totalSamples = audioBuffer.length;
  const numSegments = Math.ceil(totalSamples / samplesPerSegment);

  if (numSegments <= 1) {
    return {
      segments: [audioBlob],
      originalDurationSec,
      segmentDurationSec,
      numSegments: 1,
    };
  }

  const segments: Blob[] = [];

  for (let i = 0; i < numSegments; i++) {
    const startSample = i * samplesPerSegment;
    const endSample = Math.min(startSample + samplesPerSegment, totalSamples);
    const segmentDuration = (endSample - startSample) / sampleRate;

    // Create new AudioBuffer for this segment
    const segmentBuffer = audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      endSample - startSample,
      sampleRate
    );

    // Copy channel data
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      const segmentData = segmentBuffer.getChannelData(ch);
      segmentData.set(channelData.subarray(startSample, endSample));
    }

    // Encode segment to blob using MediaRecorder
    const segmentBlob = await new Promise<Blob>((resolve, reject) => {
      try {
        const stream = audioContext.createMediaStreamDestination();
        const source = audioContext.createBufferSource();
        source.buffer = segmentBuffer;
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

        // Stop after segment duration + small buffer
        setTimeout(() => {
          mediaRecorder.stop();
          source.stop();
        }, (segmentDuration + 0.5) * 1000);
      } catch (e) {
        reject(e);
      }
    });

    segments.push(segmentBlob);
  }

  await audioContext.close().catch(() => {});

  return {
    segments,
    originalDurationSec,
    segmentDurationSec,
    numSegments,
  };
}

/**
 * Versión simple: comprime y devuelve blob listo para subir
 * Auto-detecta si vale la pena comprimir (si > 2MB)
 */
export async function maybeCompressAudio(audioBlob: Blob, maxSizeMB = 2): Promise<Blob> {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  if (audioBlob.size <= maxSizeBytes) {
    return audioBlob; // Ya es suficientemente pequeño
  }

  logger.info('Comprimiendo audio', { sizeMB: (audioBlob.size / 1024 / 1024).toFixed(1), targetBitrate: 32000 });
      
    try {
      const result = await compressAudioBlob(audioBlob, { targetBitrate: 32000 });
      logger.info('Audio comprimido', { originalMB: (result.originalSize / 1024 / 1024).toFixed(1), compressedMB: (result.compressedSize / 1024 / 1024).toFixed(1), ratio: result.compressionRatio.toFixed(1) });
      return result.blob;
    } catch (e) {
      logger.warn('Fallo compresión, subiendo original', { error: String(e) });
      return audioBlob; // Fallback: original
    }
  }

/**
 * Hook React para usar en RecordButton
 */
export function useAudioCompressor() {
  const compress = async (blob: Blob, options?: CompressionOptions) => {
    return compressAudioBlob(blob, options);
  };

  const maybeCompress = async (blob: Blob, maxSizeMB = 2) => {
    return maybeCompressAudio(blob, maxSizeMB);
  };

  const split = async (blob: Blob, options?: SplitOptions) => {
    return splitAudioFile(blob, options);
  };

  return { compress, maybeCompress, split };
}