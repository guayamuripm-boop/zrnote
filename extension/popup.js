// ZRNote — toolbar popup. This is where recording STARTS.
//
// Not a stylistic choice: `chrome.tabCapture.getMediaStreamId()` only works
// once the extension has been "invoked" on the tab, and clicking the toolbar
// icon is exactly that invocation. A button inside the meeting page cannot grant
// it, so starting from there would fail with "Extension has not been invoked
// for the current page". The in-page panel shows status and can stop.

const $ = (id) => document.getElementById(id);

const MEETING_HOSTS = /^https:\/\/(meet\.google\.com|[\w-]+\.zoom\.us|teams\.(microsoft|live)\.com)\//;

let timerHandle = null;

/**
 * Errores que significan «el service worker todavía no está despierto», no
 * «algo está roto».
 *
 * En Manifest V3 el service worker se apaga tras ~30 s sin actividad. Al abrir
 * el popup, Chrome tiene que arrancarlo otra vez, y si el mensaje llega antes
 * de que termine de arrancar falla con estos textos. No es un fallo de la
 * extensión: es el ciclo de vida normal de MV3, y la respuesta correcta es
 * reintentar, no enseñarle al usuario «Could not establish connection».
 */
const TRANSIENT = /Could not establish connection|Receiving end does not exist|message port closed/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sendOnce = (message) =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (reply) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
          return;
        }
        resolve(reply || {});
      });
    } catch (err) {
      resolve({ error: err?.message || 'No se pudo contactar con la extensión.' });
    }
  });

/** Envía reintentando mientras el error sea de los que se curan solos. */
async function send(message, attempts = 5) {
  let last = { error: 'Sin respuesta' };

  for (let i = 1; i <= attempts; i++) {
    last = await sendOnce(message);
    if (!last.error) return last;
    // Un error real (sin sesión, servidor caído…) no mejora reintentando.
    if (!TRANSIENT.test(last.error)) return last;
    await sleep(120 * i);
  }

  return {
    error:
      'No se pudo contactar con la extensión. Abre chrome://extensions, pulsa «Actualizar» sobre ZRNote y vuelve a intentarlo.',
  };
}

function setStatus(text, kind) {
  $('status').textContent = text;
  $('dot').className = `dot${kind ? ` ${kind}` : ''}`;
}

function setMessage(text, kind) {
  $('msg').textContent = text || '';
  $('msg').className = `msg${kind ? ` ${kind}` : ''}`;
}

function formatTime(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function startTimer(fromSeconds) {
  stopTimer();
  let seconds = fromSeconds;
  $('timer').hidden = false;
  $('timer').textContent = formatTime(seconds);
  timerHandle = setInterval(() => {
    seconds += 1;
    $('timer').textContent = formatTime(seconds);
  }, 1000);
}

function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
  $('timer').hidden = true;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refresh() {
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;

  const status = await send({ type: 'GET_STATUS' });
  const backend = status.backend || 'https://zrnote.vercel.app';
  $('backend').value = backend;
  $('open-app').href = status.signedIn ? `${backend}/dashboard` : `${backend}/login`;

  // Reset
  $('consent').hidden = true;
  $('start').hidden = true;
  $('stop').hidden = true;
  $('retry').hidden = true;
  stopTimer();

  if (status.error) {
    setStatus('Error de conexión', 'warn');
    $('hint').textContent = status.error;
    $('retry').hidden = false;
    return;
  }

  if (!status.signedIn) {
    setStatus('Sin sesión iniciada', 'warn');
    $('hint').textContent =
      'Abre ZRNote e inicia sesión en el navegador. La extensión reutiliza esa sesión: no necesitas otra contraseña.';
    $('open-app').textContent = 'Iniciar sesión en ZRNote';
    return;
  }

  $('open-app').textContent = 'Abrir ZRNote';

  if (status.recording) {
    setStatus(status.title || 'Grabando', 'rec');
    $('hint').textContent =
      'Puedes cerrar esta ventana. No cierres la pestaña de la reunión mientras se graba.';
    $('stop').hidden = false;
    startTimer(status.elapsed || 0);
    return;
  }

  const tab = await activeTab();
  if (!tab || !MEETING_HOSTS.test(tab.url || '')) {
    setStatus('Abre una reunión', 'warn');
    $('hint').textContent =
      'Ve a la pestaña de tu reunión (Meet, Zoom o Teams) y vuelve a abrir ZRNote desde aquí.';
    return;
  }

  setStatus('Listo para grabar', 'ok');
  $('hint').textContent = 'Se grabará el audio de esta pestaña y tu micrófono.';
  $('consent').hidden = false;
  $('start').hidden = false;
  $('start').disabled = !$('consent-box').checked;
}

$('consent-box').addEventListener('change', (e) => {
  $('start').disabled = !e.target.checked;
});

$('retry').addEventListener('click', async () => {
  $('retry').disabled = true;
  $('retry').textContent = 'Reintentando…';
  setStatus('Comprobando…');
  $('hint').textContent = '';
  await refresh();
  $('retry').disabled = false;
  $('retry').textContent = 'Reintentar';
});

$('start').addEventListener('click', async () => {
  $('start').disabled = true;
  $('start').textContent = 'Iniciando…';
  setMessage('');

  const reply = await send({ type: 'START_RECORDING' });

  $('start').textContent = 'Grabar esta reunión';
  if (reply.error) {
    setMessage(reply.error, 'err');
    $('start').disabled = false;
    return;
  }
  refresh();
});

$('stop').addEventListener('click', async () => {
  $('stop').disabled = true;
  $('stop').textContent = 'Procesando…';
  setStatus('Transcribiendo y generando la minuta…', 'warn');
  stopTimer();
  setMessage('Puedes cerrar esta ventana: el proceso sigue en segundo plano.', 'ok');

  const reply = await send({ type: 'STOP_RECORDING' });

  $('stop').disabled = false;
  $('stop').textContent = 'Detener y generar minuta';
  if (reply.error) setMessage(reply.error, 'err');
  refresh();
});

$('save').addEventListener('click', async () => {
  const raw = $('backend').value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/.+/.test(raw)) {
    setMessage('Escribe una dirección válida (https://…).', 'err');
    return;
  }
  await send({ type: 'SET_BACKEND', url: raw });
  setMessage('Guardado.', 'ok');
  refresh();
});

refresh();
