// ZRNote Extension - Popup Script

let stats = { recorded: 0, minutes: 0 };

document.addEventListener('DOMContentLoaded', async () => {
  await loadStats();
  await loadSettings();
  setupButtons();
  setupSettings();
  checkCurrentTab();
});

async function loadStats() {
  try {
    // Intentar obtener stats de storage
    const data = await chrome.storage.local.get(['zrnote_stats']);
    if (data.zrnote_stats) {
      stats = data.zrnote_stats;
      updateStatsUI();
    }
  } catch (e) {
    console.warn('[ZRNote] Could not load stats', e);
  }
}

function updateStatsUI() {
  document.getElementById('countRecorded').textContent = stats.recorded;
  document.getElementById('countMinutes').textContent = stats.minutes;
}

function setupButtons() {
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');

  btnStart.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url?.includes('meet.google.com')) {
      alert('Por favor, abre una pestaña de Google Meet primero');
      return;
    }

    // Enviar mensaje al content script para iniciar
    chrome.tabs.sendMessage(tab.id, { type: 'START_RECORDING' });
    
    // Cerrar popup
    window.close();
  });

  btnStop.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: 'STOP_RECORDING' });
    window.close();
  });
}

async function checkCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url?.includes('meet.google.com')) {
    document.getElementById('statusDetail').textContent = 
      'Navega a Google Meet para usar ZRNote';
    return;
  }

  // Verificar si content script está inyectado
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });
    if (response) {
      updateUIFromStatus(response);
    }
  } catch (e) {
    // Content script no listo aún
  }
}

function updateUIFromStatus(status) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const detail = document.getElementById('statusDetail');
  const timer = document.getElementById('timer');
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');

  if (status.recording) {
    dot.className = 'status-dot recording';
    text.textContent = 'Grabando...';
    detail.textContent = status.meetingTitle || 'Reunión en progreso';
    timer.classList.add('show');
    btnStart.classList.add('hidden');
    btnStop.classList.add('show');
    
    // Actualizar timer si hay elapsed
    if (status.elapsed !== undefined) {
      timer.textContent = formatTime(status.elapsed);
    }
  } else if (status.processing) {
    dot.className = 'status-dot processing';
    text.textContent = 'Procesando...';
    detail.textContent = status.step || 'Generando minuta';
    timer.classList.add('show');
    btnStart.classList.add('hidden');
    btnStop.classList.add('hidden');
  } else {
    dot.className = 'status-dot ready';
    text.textContent = 'Listo para grabar';
    detail.textContent = 'Reunión detectada. Haz clic en Iniciar.';
    timer.classList.remove('show');
    btnStart.classList.remove('hidden');
    btnStop.classList.remove('show');
  }
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// Settings management
async function loadSettings() {
  const data = await chrome.storage.sync.get(['zrnote_backend_url']);
  const urlInput = document.getElementById('backendUrl');
  if (data.zrnote_backend_url) {
    urlInput.value = data.zrnote_backend_url;
  }
}

function setupSettings() {
  const toggle = document.getElementById('settingsToggle');
  const panel = document.getElementById('settingsPanel');
  const saveBtn = document.getElementById('saveSettings');
  const saveMsg = document.getElementById('saveMsg');

  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
  });

  saveBtn.addEventListener('click', async () => {
    const url = document.getElementById('backendUrl').value.trim();
    await chrome.storage.sync.set({ zrnote_backend_url: url });
    saveMsg.style.display = 'block';
    setTimeout(() => { saveMsg.style.display = 'none'; }, 2000);

    // Notificar a todas las pestañas con content script activo
    const tabs = await chrome.tabs.query({ url: '*://meet.google.com/*' });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_BACKEND_URL', url }).catch(() => {});
    }
  });
}

// Escuchar actualizaciones desde content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATUS_UPDATE') {
    updateUIFromStatus(msg.status);
  }
  if (msg.type === 'RECORDING_COMPLETE') {
    stats.recorded++;
    chrome.storage.local.set({ zrnote_stats: stats });
    updateStatsUI();
  }
  if (msg.type === 'MINUTE_GENERATED') {
    stats.minutes++;
    chrome.storage.local.set({ zrnote_stats: stats });
    updateStatsUI();
  }
});

// Poll status cada 2 segundos si hay grabación activa
setInterval(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.id) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });
      if (response) updateUIFromStatus(response);
    } catch (e) {}
  }
}, 2000);