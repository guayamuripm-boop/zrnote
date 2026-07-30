// ZRNote — offscreen recorder.
//
// Runs in a hidden extension page, so it has MediaRecorder AND an extension
// origin that can talk to the API with a bearer token (no cross-site cookies,
// no CORS problems).
//
// Segment rules, identical to the PWA recorder — these were learned the hard
// way and must not be relaxed:
//   • One segment = one complete start()→stop() MediaRecorder session. In
//     WebM/OGG the container header only exists in the FIRST chunk, so slicing
//     a continuous stream yields headerless fragments that Whisper rejects.
//   • The rotation clock is `ondataavailable`, which is driven by the media
//     pipeline rather than by a JS timer, so it keeps firing when the tab is
//     throttled in the background.
//   • Uploads are serialised: the server does a read-modify-write of
//     meetings.audio_segments and concurrent writes silently lose segments.

const SEGMENT_MS = 60 * 1000;
// Vercel rejects request bodies over 4.5MB before the handler runs.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

let recorder = null;
let tabStream = null;
let micStream = null;
let mixedStream = null;
let audioCtx = null;
let chunks = [];
let segmentIndex = 0;
let segmentStartedAt = 0;
let shouldRestart = false;
let recording = false;
let mimeType = 'audio/webm';
let config = null; // { meetingId, backend, token }
let uploadChain = Promise.resolve();
let stopResolve = null;

function pickMimeType() {
  for (const mt of ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return 'audio/webm';
}

/**
 * Build the stream that actually gets recorded.
 *
 * Tab capture alone records only what the tab PLAYS — i.e. the other
 * participants, never the person running the meeting. So the microphone is
 * mixed in when it is available. The old extension recorded tab audio only,
 * which meant the organiser was missing from their own minute.
 *
 * Capturing a tab also mutes it for the user unless the audio is played back,
 * so the tab stream is additionally routed to the speakers.
 */
async function buildStream(streamId) {
  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
    },
    video: false,
  });

  audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();

  const tabSource = audioCtx.createMediaStreamSource(tabStream);
  tabSource.connect(destination);
  // Keep the meeting audible to the user while it is being captured.
  tabSource.connect(audioCtx.destination);

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const micSource = audioCtx.createMediaStreamSource(micStream);
    // Slightly attenuated: the mic is close and would otherwise dominate the
    // remote participants coming through the tab.
    const micGain = audioCtx.createGain();
    micGain.gain.value = 0.8;
    micSource.connect(micGain).connect(destination);
    // Deliberately NOT connected to audioCtx.destination — that would echo the
    // user's own voice back at them through their speakers.
  } catch (err) {
    console.warn('[ZRNote] Sin micrófono, se graba solo el audio de la reunión:', err);
    micStream = null;
  }

  mixedStream = destination.stream;
  return mixedStream;
}

function startSegmentRecorder() {
  recorder = new MediaRecorder(mixedStream, { mimeType, audioBitsPerSecond: 128000 });
  chunks = [];
  segmentStartedAt = Date.now();

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
    if (recording && Date.now() - segmentStartedAt >= SEGMENT_MS) rotate();
  };

  recorder.onstop = () => {
    collectSegment();
    if (shouldRestart) {
      shouldRestart = false;
      startSegmentRecorder();
    } else if (stopResolve) {
      const resolve = stopResolve;
      stopResolve = null;
      resolve();
    }
  };

  recorder.start(1000);
}

function rotate() {
  if (recorder && recorder.state !== 'inactive') {
    shouldRestart = true;
    recorder.stop();
  }
}

function collectSegment() {
  if (chunks.length === 0) return;
  const blob = new Blob(chunks, { type: mimeType });
  chunks = [];
  if (blob.size === 0) return;

  const index = segmentIndex++;
  const durationSec = Math.round((Date.now() - segmentStartedAt) / 1000);
  segmentStartedAt = Date.now();

  uploadChain = uploadChain.then(() => uploadSegment(blob, index, durationSec));
}

async function uploadSegment(blob, index, durationSec, attempt = 1) {
  if (blob.size > MAX_UPLOAD_BYTES) {
    console.error(`[ZRNote] Segmento ${index} demasiado grande (${blob.size}), se descarta`);
    return;
  }

  const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('audio', blob, `segment_${index}.${ext}`);
  form.append('segmentIndex', String(index));
  form.append('durationSec', String(durationSec));

  try {
    const res = await fetch(`${config.backend}/api/meetings/${config.meetingId}/upload-segment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}` },
      body: form,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return uploadSegment(blob, index, durationSec, attempt + 1);
    }
    console.error(`[ZRNote] Segmento ${index} no se pudo subir:`, err);
  }
}

async function start(message) {
  config = { meetingId: message.meetingId, backend: message.backend, token: message.token };
  mimeType = pickMimeType();
  segmentIndex = 0;
  shouldRestart = false;
  uploadChain = Promise.resolve();

  await buildStream(message.streamId);
  recording = true;
  startSegmentRecorder();
}

async function stop() {
  recording = false;

  if (recorder && recorder.state !== 'inactive') {
    // Wait for onstop so the final segment is collected before we tear the
    // stream down — otherwise the last minute of the meeting is lost.
    await new Promise((resolve) => {
      stopResolve = resolve;
      shouldRestart = false;
      recorder.stop();
    });
  } else {
    collectSegment();
  }

  for (const stream of [tabStream, micStream, mixedStream]) {
    stream?.getTracks().forEach((t) => t.stop());
  }
  tabStream = micStream = mixedStream = null;

  if (audioCtx && audioCtx.state !== 'closed') await audioCtx.close().catch(() => {});
  audioCtx = null;

  // Let every queued upload finish before the document is torn down.
  await uploadChain.catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;

  (async () => {
    try {
      if (message.type === 'START') {
        await start(message);
        sendResponse({ ok: true });
      } else if (message.type === 'STOP') {
        await stop();
        sendResponse({ ok: true });
      }
    } catch (err) {
      console.error('[ZRNote] offscreen:', err);
      sendResponse({ error: err?.message || 'Error en el grabador' });
    }
  })();

  return true;
});
