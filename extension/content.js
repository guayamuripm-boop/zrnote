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

  const send = (message) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (reply) => {
          resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : reply || {});
        });
      } catch {
        // The extension was reloaded/updated while the page stayed open.
        resolve({ error: 'CONTEXT_LOST' });
      }
    });

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

  async function refresh() {
    const status = await send({ type: 'GET_STATUS' });
    if (status.error) {
      buildPanel();
      setStatus('Recarga la página', 'warn');
      setHint('');
      setError(
        status.error === 'CONTEXT_LOST'
          ? 'La extensión se actualizó. Recarga esta pestaña.'
          : status.error,
      );
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
    setInterval(refresh, 5000);
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
