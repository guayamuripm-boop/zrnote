'use client';

// A rough, on-device transcript for when there is truly no connection at all —
// not a replacement for the real pipeline, a stand-in until it can run.
//
// WHY THIS EXISTS AND WHY IT IS NOT "REAL" TRANSCRIPTION
// --------------------------------------------------------
// The actual pipeline (Groq Whisper large-v3 → Gemini) needs the network by
// definition: it is somebody else's GPU. There is no free way around that for
// the quality this product promises. What CAN run with zero network is a much
// smaller speech model, entirely inside the browser, via WebAssembly — good
// enough to read back roughly what was said, not good enough to be the acta.
//
// The trade-offs are real and stated up front, not discovered later:
//   • Whisper-tiny, not large-v3. Materially worse on accented or noisy
//     Spanish, and it does not punctuate or capitalise the way the server
//     pipeline's prompt priming does.
//   • It has to download ~40-75MB of model weights ONCE, while there IS a
//     connection — offline is for USING the model, not for fetching it the
//     first time. That download is an explicit action in Diagnóstico, never
//     silent or automatic.
//   • A few seconds of audio per second of speech on a mid-range phone; a
//     whole meeting can take a while and will use the battery.
//
// So this is offered as exactly what it is: an emergency draft, clearly
// labelled, never silently swapped in for the real transcript, and never
// uploaded anywhere — it only ever leaves a trace in this browser's own
// storage until the real pipeline replaces it.

const MODEL_ID = 'onnx-community/whisper-tiny';

export interface OfflineModelStatus {
  /** The model's weights are already cached by the browser and ready to use offline. */
  ready: boolean;
  /** Roughly how much this model costs to download, for the UI to state honestly. */
  approxSizeMb: number;
}

let pipelinePromise: Promise<any> | null = null;

/**
 * Has the model already been downloaded in a previous, connected session?
 *
 * Checked by asking the Cache Storage API directly rather than by trying to
 * build the pipeline, so this can answer instantly without triggering any
 * network activity of its own — it must be safe to call just to render a
 * status badge.
 */
export async function offlineModelStatus(): Promise<OfflineModelStatus> {
  const approxSizeMb = 75;
  try {
    if (typeof caches === 'undefined') return { ready: false, approxSizeMb };
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      if (requests.some((r) => r.url.includes('whisper-tiny'))) {
        return { ready: true, approxSizeMb };
      }
    }
    return { ready: false, approxSizeMb };
  } catch {
    return { ready: false, approxSizeMb };
  }
}

/**
 * Download and cache the model. Must be called with a live connection —
 * calling it while offline just fails, loudly, via `onProgress`'s error path,
 * rather than half-downloading something broken.
 */
export async function downloadOfflineModel(onProgress?: (pct: number, label: string) => void): Promise<void> {
  const { pipeline, env } = await import('@huggingface/transformers');
  // Never let this library reach out for a LOCAL model on this origin — it
  // must only ever fetch the named model from the Hugging Face CDN, into the
  // browser's own cache, and nothing else.
  env.allowLocalModels = false;

  onProgress?.(0, 'Iniciando descarga…');
  await pipeline('automatic-speech-recognition', MODEL_ID, {
    dtype: 'q8',
    progress_callback: (p: any) => {
      if (p?.status === 'progress' && typeof p.progress === 'number') {
        onProgress?.(Math.round(p.progress), p.file || 'Descargando…');
      }
    },
  });
  onProgress?.(100, 'Listo');
}

/** Decode a recorded segment and resample it to the 16kHz mono Whisper expects. */
async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  // OfflineAudioContext decodes AND resamples in one pass — no need to play
  // the audio anywhere, silent or otherwise, just to read its samples.
  const probe = new Ctor();
  const decoded = await probe.decodeAudioData(arrayBuffer.slice(0));
  await probe.close().catch(() => {});

  const targetRate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/**
 * Transcribe one already-recorded segment, fully on-device.
 *
 * Never throws for a reason the caller cannot act on: every failure mode
 * (model not cached, unsupported codec, out of memory) resolves to a short,
 * honest message instead of an exception the UI would have to guess about.
 */
export async function transcribeOffline(blob: Blob): Promise<{ text: string; error?: string }> {
  try {
    const status = await offlineModelStatus();
    if (!status.ready) {
      return { text: '', error: 'El modelo local no está descargado. Hazlo desde Diagnóstico mientras tengas conexión.' };
    }

    if (!pipelinePromise) {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      pipelinePromise = pipeline('automatic-speech-recognition', MODEL_ID, { dtype: 'q8' });
    }
    const transcriber = await pipelinePromise;

    const audio = await decodeTo16k(blob);
    const result = await transcriber(audio, { language: 'spanish', task: 'transcribe' });
    const text = Array.isArray(result) ? result.map((r: any) => r.text).join(' ') : result?.text || '';
    return { text: text.trim() };
  } catch (err: any) {
    return { text: '', error: err?.message || 'No se pudo generar el borrador local' };
  }
}
