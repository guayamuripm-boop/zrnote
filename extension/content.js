// ZRNote — in-meeting panel.
//
// Status and STOP only. Recording is started from the toolbar popup, because
// `chrome.tabCapture` requires the extension to have been invoked on the tab
// (clicking the toolbar icon), which a button inside the page cannot grant.
//
// No network calls happen here on purpose: a content script runs on the
// meeting's origin, so it cannot authenticate against ZRNote — which is exactly
// why the previous version never managed to upload a single segment.

(() => {
  const PANEL_ID = 'zrnote-recorder-ui';
  if (window.__zrnoteInjected) return; // guard against double injection
  window.__zrnoteInjected = true;

  let elapsedTimer = null;
  let startedAt = 0;

  // Mismos textos que en popup.js: significan «el service worker aún no ha
  // arrancado», no «algo está roto». En MV3 el worker se apaga tras ~30 s sin
  // actividad y hay que darle tiempo a despertar. Antes, el primer mensaje que
  // caía en esa ventana pintaba «Could not establish connection» en el panel,
  // en medio de la reunión y sin forma de recuperarse.
  const TRANSIENT = /Could not establish connection|Receiving end does not exist|message port closed/i;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** `chrome.runtime.id` desaparece cuando la extensión se recarga o actualiza. */
  const contextAlive = () => {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  };

  const sendOnce = (message) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (reply) => {
          resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : reply || {});
        });
      } catch {
        resolve({ error: 'CONTEXT_LOST' });
      }
    });

  async function send(message, attempts = 5) {
    if (!contextAlive()) return { error: 'CONTEXT_LOST' };

    let last = { error: 'Sin respuesta' };
    for (let i = 1; i <= attempts; i++) {
      last = await sendOnce(message);
      if (!last.error) return last;
      if (last.error === 'CONTEXT_LOST' || !TRANSIENT.test(last.error)) return last;
      // Si el contexto muere a mitad de los reintentos, deja de insistir: el
      // mensaje correcto para el usuario es "recarga la pestaña".
      if (!contextAlive()) return { error: 'CONTEXT_LOST' };
      await sleep(120 * i);
    }
    return { error: 'SW_DOWN' };
  }

  const formatTime = (total) =>
    [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');

  function buildPanel() {
    let root = document.getElementById(PANEL_ID);
    if (root) return root;

    root = document.createElement('div');
    root.id = PANEL_ID;
    root.innerHTML = `
      <div class="zrn-panel">
        <div class="zrn-head">
          <span class="zrn-logo">ZR</span>
          <span class="zrn-title">ZRNote</span>
          <button class="zrn-collapse" title="Ocultar">–</button>
        </div>
        <div class="zrn-body">
          <div class="zrn-status"><span class="zrn-dot"></span><span class="zrn-status-text">…</span></div>
          <div class="zrn-timer" hidden>00:00:00</div>
          <p class="zrn-hint"></p>
          <button class="zrn-btn zrn-stop" hidden>Detener y generar minuta</button>
          <p class="zrn-error" hidden></p>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    root.querySelector('.zrn-collapse').addEventListener('click', () => {
      const panel = root.querySelector('.zrn-panel');
      panel.classList.toggle('zrn-collapsed');
      root.querySelector('.zrn-collapse').textContent =
        panel.classList.contains('zrn-collapsed') ? '+' : '–';
    });

    root.querySelector('.zrn-stop').addEventListener('click', async () => {
      const btn = root.querySelector('.zrn-stop');
      btn.disabled = true;
      btn.textContent = 'Procesando…';
      setStatus('Transcribiendo y generando la minuta…', 'busy');
      stopTimer();

      const reply = await send({ type: 'STOP_RECORDING' });
      btn.disabled = false;
      btn.textContent = 'Detener y generar minuta';
      if (reply.error) setError(reply.error);
      refresh();
    });

    return root;
  }

  function setStatus(text, kind) {
    const root = document.getElementById(PANEL_ID);
    if (!root) return;
    root.querySelector('.zrn-status-text').textContent = text;
    root.querySelector('.zrn-dot').className = `zrn-dot${kind ? ` zrn-dot-${kind}` : ''}`;
  }

  function setHint(text) {
    const el = document.getElementById(PANEL_ID)?.querySelector('.zrn-hint');
    if (el) el.textContent = text || '';
  }

  function setError(message) {
    const el = document.getElementById(PANEL_ID)?.querySelector('.zrn-error');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  function startTimer() {
    stopTimer();
    const timer = document.getElementById(PANEL_ID)?.querySelector('.zrn-timer');
    if (!timer) return;
    timer.hidden = false;
    const tick = () => {
      timer.textContent = formatTime(Math.floor((Date.now() - startedAt) / 1000));
    };
    tick();
    elapsedTimer = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = null;
    const timer = document.getElementById(PANEL_ID)?.querySelector('.zrn-timer');
    if (timer) timer.hidden = true;
  }

  function render(status) {
    buildPanel();
    const stopBtn = document.getElementById(PANEL_ID).querySelector('.zrn-stop');
    setError('');

    if (!status.signedIn) {
      setStatus('Sin sesión iniciada', 'warn');
      setHint('Abre ZRNote en otra pestaña e inicia sesión.');
      stopBtn.hidden = true;
      stopTimer();
      return;
    }

    if (status.recording) {
      setStatus('Grabando', 'rec');
      setHint('No cierres esta pestaña mientras se graba.');
      stopBtn.hidden = false;
      startTimer();
      return;
    }

    setStatus('Listo para grabar', 'ok');
    setHint('Pulsa el icono de ZRNote en la barra del navegador para empezar.');
    stopBtn.hidden = true;
    stopTimer();
  }

  const ERROR_TEXT = {
    CONTEXT_LOST: 'La extensión se actualizó. Recarga esta pestaña (F5) para volver a conectarla.',
    SW_DOWN:
      'No responde el motor de la extensión. Abre chrome://extensions, pulsa «Actualizar» sobre ZRNote y recarga esta pestaña.',
  };

  async function refresh() {
    const status = await send({ type: 'GET_STATUS' });
    if (status.error) {
      buildPanel();
      setStatus('Recarga la página', 'warn');
      setHint('');
      setError(ERROR_TEXT[status.error] || status.error);
      // No se toca el botón de detener: si había una grabación en curso, el
      // usuario tiene que seguir pudiendo pararla aunque el panel no sepa
      // el estado exacto en este momento.
      return;
    }
    if (status.recording) startedAt = Date.now() - (status.elapsed || 0) * 1000;
    render(status);
  }

  // Meeting apps rebuild their DOM constantly; re-attach if the panel is torn
  // out. (The previous script waited on obfuscated Google class names that
  // change without notice, so it often never appeared at all.)
  const observer = new MutationObserver(() => {
    if (!document.getElementById(PANEL_ID)) refresh();
  });

  function boot() {
    refresh();
    observer.observe(document.body, { childList: true });

    // Keep the panel honest if recording was started from the popup.
    //
    // El sondeo se DETIENE si la extensión se recargó: sin recargar la pestaña
    // ese estado no se arregla nunca, así que seguir preguntando cada 5 s sólo
    // gasta batería y llena la consola de la reunión con errores.
    const poll = setInterval(async () => {
      if (!contextAlive()) {
        clearInterval(poll);
        observer.disconnect();
        return;
      }
      await refresh();
    }, 5000);
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
