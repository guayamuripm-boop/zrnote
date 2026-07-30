// ZRNote — Extension background service worker (MV3)
//
// Owns everything that must survive the page: authentication, creating the
// ZRNote meeting, capturing the tab, and driving the offscreen recorder.
//
// Why this shape:
//   • The old version recorded inside a CONTENT SCRIPT on meet.google.com and
//     called the API with `credentials: 'include'`. Supabase's auth cookie is
//     SameSite=Lax, so the browser never attached it to those cross-site
//     requests — every call was a 401. Here the token is read explicitly from
//     the ZRNote domain and sent as `Authorization: Bearer …`.
//   • The old version also used the Google Meet room code (`abc-defg-hij`) as
//     if it were the ZRNote meeting id, so every upload hit a UUID column with
//     a non-UUID and 404'd. It never created a meeting at all. Now the meeting
//     is created through `POST /api/meetings` and the returned UUID is used.

const DEFAULT_BACKEND = 'https://zrnote.vercel.app';
const OFFSCREEN_PATH = 'offscreen.html';

/** Current recording, if any. Kept in storage so a worker restart recovers it. */
let session = null;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

async function getBackendUrl() {
  const { zrnote_backend_url } = await chrome.storage.sync.get(['zrnote_backend_url']);
  return (zrnote_backend_url || DEFAULT_BACKEND).replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Read the user's Supabase access token from the ZRNote domain's own cookie.
 *
 * Supabase stores the session in `sb-<project-ref>-auth-token`. Large sessions
 * are split across `.0`, `.1`, … chunks, and the value may be prefixed with
 * `base64-`. All of that has to be reassembled before parsing.
 */
async function getAccessToken() {
  const backend = await getBackendUrl();
  const cookies = await chrome.cookies.getAll({ url: backend });

  const authCookies = cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (authCookies.length === 0) return null;

  let raw = authCookies.map((c) => c.value).join('');
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* already decoded */
  }
  if (raw.startsWith('base64-')) {
    try {
      raw = atob(raw.slice(7));
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(raw);
    const token = Array.isArray(parsed) ? parsed[0] : parsed.access_token;
    return typeof token === 'string' && token.length > 20 ? token : null;
  } catch {
    return null;
  }
}

async function api(path, options = {}) {
  const backend = await getBackendUrl();
  const token = await getAccessToken();
  if (!token) {
    const err = new Error('NO_SESSION');
    err.code = 'NO_SESSION';
    throw err;
  }

  const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  if (options.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json';

  const res = await fetch(`${backend}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Offscreen document — where the actual recording happens
// ---------------------------------------------------------------------------
//
// A content script cannot capture tab audio in MV3, and the service worker has
// no DOM/MediaRecorder. An offscreen document has both, AND its origin is
// chrome-extension://<id>, so it can upload straight to the API without any
// cross-site cookie or CORS problem.

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA'],
    justification: 'Grabar el audio de la reunión y subirlo a ZRNote.',
  });
}

async function closeOffscreen() {
  try {
    const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (existing.length > 0) await chrome.offscreen.closeDocument();
  } catch {
    /* already gone */
  }
}

// ---------------------------------------------------------------------------
// Recording lifecycle
// ---------------------------------------------------------------------------

function meetingTitleFor(tab) {
  const raw = (tab?.title || '').replace(/^\(\d+\)\s*/, '').trim();
  const platform = /meet\.google/.test(tab?.url || '')
    ? 'Meet'
    : /zoom\.us/.test(tab?.url || '')
      ? 'Zoom'
      : /teams\./.test(tab?.url || '')
        ? 'Teams'
        : 'Reunión';
  const now = new Date();
  const stamp = `${now.toLocaleDateString('es', { day: 'numeric', month: 'short' })} ${now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
  const base = raw && !/^(meet|zoom|teams)/i.test(raw) ? raw.slice(0, 80) : `${platform} ${stamp}`;
  return base;
}

async function startRecording(tab) {
  if (session) throw new Error('Ya hay una grabación en curso.');

  // 1. Create a REAL meeting in ZRNote and keep its UUID.
  const title = meetingTitleFor(tab);
  const created = await api('/api/meetings', {
    method: 'POST',
    body: JSON.stringify({ title, coordination: '', type: 'virtual', participants: [] }),
  });
  const meetingId = created.id;
  if (!meetingId) throw new Error('El servidor no devolvió la reunión creada.');

  // 2. Record the recording-consent declaration before capturing anything.
  await api(`/api/meetings/${meetingId}/consent`, { method: 'POST' });

  // 3. Capture the tab's audio. getMediaStreamId must be called from here, and
  //    the id can only be consumed by the extension itself.
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });

  await ensureOffscreen();

  const backend = await getBackendUrl();
  const token = await getAccessToken();

  const result = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'START',
    streamId,
    meetingId,
    backend,
    token,
    title,
  });

  if (result?.error) {
    await closeOffscreen();
    throw new Error(result.error);
  }

  session = { meetingId, tabId: tab.id, title, startedAt: Date.now() };
  await chrome.storage.session.set({ session });

  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });

  return session;
}

async function stopRecording() {
  if (!session) return { ok: true };

  const current = session;
  session = null;
  await chrome.storage.session.remove('session');
  chrome.action.setBadgeText({ text: '' });

  // The offscreen document finishes the last segment and uploads it.
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP' }).catch(() => {});
  await closeOffscreen();

  notify('Procesando la reunión', 'Transcribiendo y generando la minuta…');

  try {
    await api(`/api/meetings/${current.meetingId}/finalize`, { method: 'POST' });
    await runPipeline(current.meetingId);
  } catch (err) {
    notify('No se pudo procesar', err.message || 'Error desconocido');
    return { ok: false, error: err.message, meetingId: current.meetingId };
  }

  return { ok: true, meetingId: current.meetingId };
}

/**
 * Same three steps the web app runs (see src/lib/pipeline-client.ts):
 * transcribe → analyze → emails. `vectorize` is optional and deliberately
 * skipped, and an e-mail failure must not discard a good minute.
 */
async function runPipeline(meetingId) {
  const steps = ['transcribe', 'analyze', 'emails'];

  for (const step of steps) {
    let guard = 0;
    let more = true;

    while (more && guard++ < 120) {
      let data;
      try {
        data = await api(`/api/meetings/${meetingId}/process`, {
          method: 'POST',
          body: JSON.stringify({ step }),
        });
      } catch (err) {
        if (err.status === 429) {
          await sleep(20000);
          continue;
        }
        if (step === 'emails') return; // minute exists; e-mail trouble is not fatal
        throw err;
      }

      if (data.ok === false) {
        if (step === 'emails' && !data.fatal) return;
        throw new Error(data.error || `Falló el paso ${step}`);
      }

      more = step === 'transcribe' && !!data.more;
      if (more) await sleep(1500);
    }
  }

  const backend = await getBackendUrl();
  notify('Minuta lista', 'Ábrela en ZRNote para revisarla.');
  chrome.tabs.create({ url: `${backend}/dashboard/meetings/${meetingId}` });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function notify(title, message) {
  chrome.notifications
    .create({ type: 'basic', iconUrl: 'icons/icon-128.png', title: `ZRNote — ${title}`, message })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Messages aimed at the offscreen document are not ours to handle.
  if (msg?.target === 'offscreen') return;

  (async () => {
    try {
      switch (msg?.type) {
        case 'GET_STATUS': {
          if (!session) {
            const stored = await chrome.storage.session.get('session');
            session = stored.session || null;
          }
          const token = await getAccessToken();
          sendResponse({
            signedIn: !!token,
            recording: !!session,
            meetingId: session?.meetingId,
            title: session?.title,
            elapsed: session ? Math.floor((Date.now() - session.startedAt) / 1000) : 0,
            backend: await getBackendUrl(),
          });
          break;
        }

        case 'START_RECORDING': {
          const tab =
            sender.tab ||
            (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
          if (!tab?.id) throw new Error('No se encontró la pestaña de la reunión.');
          const started = await startRecording(tab);
          sendResponse({ ok: true, ...started });
          break;
        }

        case 'STOP_RECORDING':
          sendResponse(await stopRecording());
          break;

        case 'SET_BACKEND':
          await chrome.storage.sync.set({ zrnote_backend_url: msg.url });
          sendResponse({ ok: true });
          break;

        default:
          sendResponse({ error: 'Mensaje desconocido' });
      }
    } catch (err) {
      sendResponse({
        error:
          err.code === 'NO_SESSION'
            ? 'No has iniciado sesión en ZRNote. Abre la app, inicia sesión y vuelve a intentarlo.'
            : err.message || 'Error desconocido',
      });
    }
  })();

  return true; // keep the channel open for the async reply
});

// Stop cleanly if the meeting tab goes away mid-recording.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (session && session.tabId === tabId) stopRecording();
});

chrome.runtime.onInstalled.addListener(() => {
  // Badge state does not survive an update/reload.
  chrome.action.setBadgeText({ text: '' });
});
