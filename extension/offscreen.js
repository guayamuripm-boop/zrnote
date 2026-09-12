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
//
// What changed on 11 Sep 2026, bringing this in line with the web recorder:
//   • Audio is written to IndexedDB before any upload is attempted, so a
//     failed upload is a delay rather than a deletion. It used to retry three
//     times over 4.5 seconds and then `console.error` — into a console nobody
//     has open — while the audio was discarded for good.
//   • The mix no longer clips. See buildStream().
//   • 32 kbps instead of 128: four times smaller, and Whisper hears no
//     difference on speech.
//   • The tab and the microphone are watched, so losing either is reported
//     instead of producing a silent recording nobody notices until the end.

const SEGMENT_MS = 60 * 1000;
// 32 kbps mono Opus is transparent for speech. 128 made every upload four
// times heavier for nothing, and pushed 60s segments toward Vercel's cap.
const AUDIO_BITS_PER_SECOND = 32000;
const MAX_ATTEMPTS = 8;
const BACKOFF_MS = (attempt) => Math.min(2000 * 2 ** (attempt - 1), 60000);

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
let stopResolve = null;
let draining = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function report(level, message) {
  chrome.runtime.sendMessage({ type: 'RECORDER_STATUS', level, message }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Durable segment store
// ---------------------------------------------------------------------------
// Same contract as src/lib/recording-store.ts in the web app: a segment is on
// disk before anyone tries to upload it, and is deleted only once the server
// has confirmed it. The extension cannot import that module (no bundler here),
// so the essential part is restated.

const DB_NAME = 'zrnote-extension-recordings';
const STORE = 'segments';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function dbRun(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

async function saveSegment(record) {
  try {
    await dbRun('readwrite', (s) => s.put(record));
    return true;
  } catch {
    return false;
  }
}

async function allSegments() {
  try {
    const all = await dbRun('readonly', (s) => s.getAll());
    return (all || []).sort((a, b) => a.savedAt - b.savedAt);
  } catch {
    return [];
  }
}

async function dropSegment(id) {
  try {
    await dbRun('readwrite', (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}

async function markSegment(id, patch) {
  try {
    const current = await dbRun('readonly', (s) => s.get(id));
    if (!current) return;
    await dbRun('readwrite', (s) => s.put({ ...current, ...patch }));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Upload queue
// ---------------------------------------------------------------------------

/** A 4xx other than 408/429 will reject these exact bytes every time. */
function isPermanent(status) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

async function postSegment(record) {
  const res = await fetch(`${record.backend}/api/meetings/${record.meetingId}/upload-segment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${record.token || config?.token || ''}` },
    body: (() => {
      const form = new FormData();
      const ext = record.mime.includes('ogg') ? 'ogg' : 'webm';
      form.append('audio', record.blob, `segment_${record.index}.${ext}`);
      form.append('segmentIndex', String(record.index));
      form.append('durationSec', String(record.durationSec));
      return form;
    })(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.permanent = isPermanent(res.status);
    throw err;
  }
}

/**
 * Drain everything on disk, oldest first, one at a time.
 *
 * Serial on purpose: `meetings.audio_segments` is read-modify-written on the
 * server, so two uploads in flight can lose an entry.
 */
function drain() {
  if (draining) return draining;
  draining = (async () => {
    try {
      for (;;) {
        const queue = await allSegments();
        const next = queue.find((r) => r.state !== 'failed');
        if (!next) break;

        let attempt = next.attempts || 0;
        let done = false;

        while (!done) {
          attempt += 1;
          if (!navigator.onLine) {
            await sleep(10000);
            attempt -= 1;
            continue;
          }
          try {
            await markSegment(next.id, { state: 'uploading', attempts: attempt });
            await postSegment(next);
            await dropSegment(next.id);
            done = true;
          } catch (err) {
            if (err?.permanent || attempt >= MAX_ATTEMPTS) {
              await markSegment(next.id, {
                state: 'failed',
                attempts: attempt,
                lastError: err?.message || String(err),
              });
              report('error', `Un fragmento de audio no se pudo subir: ${err?.message || err}`);
              done = true;
            } else {
              await markSegment(next.id, { state: 'pending', attempts: attempt });
              await sleep(BACKOFF_MS(attempt));
            }
          }
        }
      }
    } finally {
      draining = null;
    }
  })();
  return draining;
}

async function pendingCount() {
  const queue = await allSegments();
  return {
    pending: queue.filter((r) => r.state !== 'failed').length,
    failed: queue.filter((r) => r.state === 'failed').length,
  };
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

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
 * GAIN STAGING — this is what makes the recording usable.
 * The previous mix summed the tab at full scale with the microphone at 0.8.
 * Whenever two people spoke at once, which in a meeting is constantly, the sum
 * went past full scale and the result clipped: harsh, distorted audio that
 * Whisper transcribes as nonsense or as nothing. Both sources are now
 * attenuated to leave headroom and everything passes through a limiter, which
 * does nothing at all until something is about to clip and then catches only
 * that.
 *
 * Capturing a tab also mutes it for the user, so the tab is additionally
 * routed to the speakers — from the RAW source, at full volume, so that what
 * the user hears is unaffected by the recording's gain staging.
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

  const limiter = audioCtx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(destination);

  const tabSource = audioCtx.createMediaStreamSource(tabStream);
  const tabGain = audioCtx.createGain();
  tabGain.gain.value = 0.72;
  tabSource.connect(tabGain).connect(limiter);
  // Straight to the speakers, untouched, so the meeting sounds normal to the
  // person in it. Capturing a tab silences it otherwise.
  tabSource.connect(audioCtx.destination);

  watchTrack(tabStream.getAudioTracks()[0], 'la reunión');

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const micSource = audioCtx.createMediaStreamSource(micStream);
    const micGain = audioCtx.createGain();
    micGain.gain.value = 0.72;
    micSource.connect(micGain).connect(limiter);
    // Deliberately NOT connected to audioCtx.destination — that would echo the
    // user's own voice back at them through their speakers.
    watchTrack(micStream.getAudioTracks()[0], 'el micrófono');
  } catch (err) {
    console.warn('[ZRNote] Sin micrófono, se graba solo el audio de la reunión:', err);
    micStream = null;
    report('warn', 'No se pudo usar el micrófono: se grabará solo el audio de la reunión.');
  }

  mixedStream = destination.stream;
  return mixedStream;
}

/**
 * A source dying mid-meeting used to be completely silent: the recorder went
 * on producing a file, and the file went on being empty on that side.
 */
function watchTrack(track, label) {
  if (!track) return;
  track.addEventListener('ended', () => {
    if (!recording) return;
    report('error', `Se perdió el audio de ${label}. Lo grabado hasta ahora está a salvo.`);
  });
  track.addEventListener('mute', () => {
    if (!recording) return;
    report('warn', `El audio de ${label} se ha silenciado.`);
  });
}

function startSegmentRecorder() {
  recorder = new MediaRecorder(mixedStream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
  chunks = [];
  segmentStartedAt = Date.now();

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
    if (recording && Date.now() - segmentStartedAt >= SEGMENT_MS) rotate();
  };

  // A recorder error used to end the capture invisibly.
  recorder.onerror = () => {
    report('error', 'El grabador falló. Detén y vuelve a iniciar la grabación.');
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

  // To disk first, upload second. From here the audio survives this document
  // being torn down, the browser being closed, or every upload failing.
  void saveSegment({
    id: `${config.meetingId}:${index}`,
    meetingId: config.meetingId,
    backend: config.backend,
    token: config.token,
    index,
    blob,
    mime: mimeType,
    durationSec,
    state: 'pending',
    attempts: 0,
    savedAt: Date.now(),
  }).then(() => {
    void drain();
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Where this recording's segment numbering starts.
 *
 * It used to be a hardcoded 0. The extension normally creates a fresh meeting
 * per recording so that was usually right — but "usually right" is how audio
 * gets overwritten. The server is asked, and anything still queued on disk for
 * the same meeting is taken into account too.
 */
async function resolveStartIndex() {
  let serverNext = 0;
  try {
    const res = await fetch(`${config.backend}/api/meetings/${config.meetingId}/direct-upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'begin' }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) serverNext = Number(data.nextIndex) || 0;
  } catch {
    /* not fatal: fall back to what is on disk */
  }

  const queue = await allSegments();
  const localNext = queue
    .filter((r) => r.meetingId === config.meetingId)
    .reduce((max, r) => Math.max(max, r.index + 1), 0);

  return Math.max(serverNext, localNext);
}

async function start(message) {
  config = { meetingId: message.meetingId, backend: message.backend, token: message.token };
  mimeType = pickMimeType();
  shouldRestart = false;

  // Anything left over from a previous recording goes up first — including
  // from a session that ended badly. This is the extension's only chance to
  // recover it, since the offscreen document does not exist between meetings.
  void drain();

  segmentIndex = await resolveStartIndex();

  await buildStream(message.streamId);
  recording = true;
  startSegmentRecorder();
}

async function stop() {
  recording = false;

  if (recorder && recorder.state !== 'inactive') {
    // Wait for onstop so the final segment is collected before we tear the
    // stream down — otherwise the last minute of the meeting is lost. A
    // recorder that never fires it must not hang the stop for ever.
    await Promise.race([
      new Promise((resolve) => {
        stopResolve = resolve;
        shouldRestart = false;
        recorder.stop();
      }),
      sleep(5000),
    ]);
  } else {
    collectSegment();
  }

  for (const stream of [tabStream, micStream, mixedStream]) {
    stream?.getTracks().forEach((t) => t.stop());
  }
  tabStream = micStream = mixedStream = null;

  if (audioCtx && audioCtx.state !== 'closed') await audioCtx.close().catch(() => {});
  audioCtx = null;

  // Everything captured is on disk; this pushes it to the server. The document
  // must not be closed until it finishes, or the retries stop with it.
  await drain();
  return pendingCount();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;

  (async () => {
    try {
      if (message.type === 'START') {
        await start(message);
        sendResponse({ ok: true });
      } else if (message.type === 'STOP') {
        const left = await stop();
        sendResponse({ ok: true, ...left });
      }
    } catch (err) {
      console.error('[ZRNote] offscreen:', err);
      sendResponse({ error: err?.message || 'Error en el grabador' });
    }
  })();

  return true;
});
