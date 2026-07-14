/**
 * Audio Compression Utility
 * Comprime audio WebM/Opus a bitrate objetivo usando MediaRecorder
 * Útil para reducir archivos de móviles antes de subir
 */

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
 * Versión simple: comprime y devuelve blob listo para subir
 * Auto-detecta si vale la pena comprimir (si > 2MB)
 */
export async function maybeCompressAudio(audioBlob: Blob, maxSizeMB = 2): Promise<Blob> {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  if (audioBlob.size <= maxSizeBytes) {
    return audioBlob; // Ya es suficientemente pequeño
  }

  console.log(`[AudioCompressor] Comprimiendo ${(audioBlob.size / 1024 / 1024).toFixed(1)}MB → target 32kbps...`);
  
  try {
    const result = await compressAudioBlob(audioBlob, { targetBitrate: 32000 });
    console.log(`[AudioCompressor] ${(result.originalSize / 1024 / 1024).toFixed(1)}MB → ${(result.compressedSize / 1024 / 1024).toFixed(1)}MB (${result.compressionRatio.toFixed(1)}x)`);
    return result.blob;
  } catch (e) {
    console.warn('[AudioCompressor] Falló compresión, subiendo original:', e);
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

  return { compress, maybeCompress };
}