// ZRNote Meet Recorder - Content Script (JavaScript)
// Se inyecta en meet.google.com

// Audio compression utility (same as PWA)
async function maybeCompressAudio(audioBlob, maxSizeMB = 2) {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (audioBlob.size <= maxSizeBytes) return audioBlob;

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') await audioContext.resume();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const targetBitrate = 32000; // 32 kbps for voice
    const stream = audioContext.createMediaStreamDestination();
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(stream);
    source.start(0);

    const mediaRecorder = new MediaRecorder(stream.stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: targetBitrate,
    });

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
      resolve(blob);
    };

    return new Promise((resolve, reject) => {
      mediaRecorder.onerror = reject;
      mediaRecorder.start(1000);
      setTimeout(() => {
        mediaRecorder.stop();
        source.stop();
        audioContext.close().catch(() => {});
      }, (audioBuffer.duration + 0.5) * 1000);
    });
  } catch (e) {
    console.warn('[ZRNote] Compression failed, uploading original:', e);
    return audioBlob;
  }
}

class MeetRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.segmentIndex = 0;
    this.recording = false;
    this.processing = false;
    this.meetingId = this.extractMeetingId();
    this.meetingTitle = this.extractMeetingTitle();
    this.startTime = 0;
    this.segmentTimer = null;
    this.elapsedTimer = null;
    this.API_BASE = 'https://zrnote.vercel.app';
    this.SEGMENT_DURATION_MS = 30 * 60 * 1000;
    this.FLUSH_INTERVAL_MS = 30 * 1000;
    this.init();
  }

  async init() {
    // Cargar URL configurada desde storage
    try {
      const data = await chrome.storage.sync.get(['zrnote_backend_url']);
      if (data.zrnote_backend_url) {
        this.API_BASE = data.zrnote_backend_url.replace(/\/+$/, '');
      }
    } catch (e) {}

    // Escuchar mensajes del popup/background
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      this.handleMessage(msg, sendResponse);
      return true; // async
    });

    // Esperar a que Meet cargue
    await this.waitForMeet();
    this.injectUI();
    this.broadcastStatus({ recording: false, processing: false });
  }

  handleMessage(msg, sendResponse) {
    switch (msg.type) {
      case 'START_RECORDING':
        this.startRecording().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ error: e.message }));
        break;
      case 'STOP_RECORDING':
        this.stopRecording().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ error: e.message }));
        break;
      case 'GET_STATUS':
        sendResponse(this.getStatus());
        break;
      case 'UPDATE_BACKEND_URL':
        if (msg.url) {
          this.API_BASE = msg.url.replace(/\/+$/, '');
          chrome.storage.sync.set({ zrnote_backend_url: msg.url }).catch(() => {});
        }
        sendResponse({ ok: true });
        break;
    }
  }

  getStatus() {
    return {
      recording: this.recording,
      processing: this.processing,
      meetingTitle: this.meetingTitle,
      elapsed: this.recording ? Math.floor((Date.now() - this.startTime) / 1000) : undefined,
    };
  }

  extractMeetingId() {
    const match = window.location.href.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
    return match ? match[1] : `meet_${Date.now()}`;
  }

  extractMeetingTitle() {
    const selectors = [
      '[data-meeting-title]',
      'h1[jsname]',
      '.G5t3rd',
      'div[aria-label^="Título de la reunión"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    return 'Google Meet';
  }

  async waitForMeet() {
    return new Promise(resolve => {
      const check = () => {
        if (document.querySelector('[data-meeting-id]') || document.querySelector('.G5t3rd')) {
          resolve();
        } else {
          setTimeout(check, 1000);
        }
      };
      check();
    });
  }

  injectUI() {
    if (document.getElementById('zrnote-recorder-ui')) return;

    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'zrnote-recorder-ui';
    this.uiContainer.innerHTML = `
      <div class="zrnote-panel">
        <div class="zrnote-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
          <span>ZRNote Recorder</span>
        </div>
        <div class="zrnote-status" id="zrnote-status">
          <span class="status-dot"></span>
          <span class="status-text">Listo para grabar</span>
        </div>
        <div class="zrnote-timer" id="zrnote-timer" style="display:none">00:00:00</div>
        <div class="zrnote-controls">
          <button id="zrnote-start" class="zrnote-btn primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            Iniciar Grabación
          </button>
          <button id="zrnote-stop" class="zrnote-btn danger" style="display:none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
            Detener y Procesar
          </button>
        </div>
        <div class="zrnote-info">
          <small>Reunión: ${this.meetingTitle || 'Detectando...'}</small>
          <small>ID: ${this.meetingId || '-'}</small>
        </div>
      </div>
    `;

    // Estilos inyectados
    const style = document.createElement('style');
    style.textContent = `
      #zrnote-recorder-ui {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .zrnote-panel {
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        padding: 16px;
        min-width: 280px;
        border: 1px solid #e5e7eb;
      }
      .zrnote-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 12px;
      }
      .zrnote-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #f3f4f6;
        border-radius: 8px;
        margin-bottom: 12px;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #10b981;
      }
      .status-dot.recording {
        background: #ef4444;
        animation: pulse 1.5s infinite;
      }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      .zrnote-timer {
        text-align: center;
        font-family: 'SF Mono', Monaco, monospace;
        font-size: 24px;
        font-weight: 600;
        color: #ef4444;
        margin-bottom: 12px;
        padding: 8px;
        background: #fef2f2;
        border-radius: 8px;
      }
      .zrnote-controls {
        display: flex;
        gap: 8px;
      }
      .zrnote-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 16px;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .zrnote-btn.primary { background: #2563eb; color: white; }
      .zrnote-btn.primary:hover { background: #1d4ed8; }
      .zrnote-btn.danger { background: #ef4444; color: white; }
      .zrnote-btn.danger:hover { background: #dc2626; }
      .zrnote-info {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
        gap: 4px;
        color: #6b7280;
        font-size: 12px;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(this.uiContainer);

    // Event listeners
    document.getElementById('zrnote-start').addEventListener('click', () => this.startRecording());
    document.getElementById('zrnote-stop').addEventListener('click', () => this.stopRecording());
  }

  updateUI(recording, processing, step) {
    const startBtn = document.getElementById('zrnote-start');
    const stopBtn = document.getElementById('zrnote-stop');
    const statusEl = document.getElementById('zrnote-status');
    const timerEl = document.getElementById('zrnote-timer');

    if (recording) {
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'flex';
      if (statusEl) {
        statusEl.innerHTML = '<span class="status-dot recording"></span><span class="status-text">Grabando...</span>';
      }
      if (timerEl) timerEl.style.display = 'block';
    } else if (processing) {
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'none';
      if (statusEl) {
        statusEl.innerHTML = '<span class="status-dot" style="background:#f59e0b"></span><span class="status-text">' + (arguments[2] || 'Procesando...') + '</span>';
      }
      if (timerEl) timerEl.style.display = 'none';
    } else {
      if (startBtn) startBtn.style.display = 'flex';
      if (stopBtn) stopBtn.style.display = 'none';
      if (statusEl) {
        statusEl.innerHTML = '<span class="status-dot"></span><span class="status-text">Listo para grabar</span>';
      }
      if (timerEl) timerEl.style.display = 'none';
    }
  }

  async startRecording() {
    if (this.recording) return;

    try {
      // Solicitar captura de pestaña con audio
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 2 },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        systemAudio: 'include',
      });

      // Detectar cuando usuario detiene captura nativa
      const videoTrack = this.stream.getVideoTracks()[0];
      videoTrack?.addEventListener('ended', () => {
        if (this.recording) this.stopRecording();
      });

      // FORZAR audio/webm (SIN codecs=opus) para compatibilidad móvil
      const mimeTypes = [
        'audio/webm',           // MÁS COMPATIBLE
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      let mimeType = 'audio/webm';
      for (const mt of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mt)) {
          mimeType = mt;
          break;
        }
      }
      console.log('[ZRNote] Using mimeType:', mimeType);

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000,  // Bitrate fijo alto
      });

      this.chunks = [];
      this.segmentIndex = 0;
      this.recording = true;
      this.startTime = Date.now();

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        await this.flushSegment();
      };

      this.mediaRecorder.start(1000);

      // Flush periódico
      this.segmentTimer = setInterval(() => {
        if (this.recording && this.chunks.length > 0) {
          this.flushSegment();
        }
      }, this.FLUSH_INTERVAL_MS);

      // Auto-split segmentos largos
      setTimeout(() => {
        if (this.recording) {
          this.mediaRecorder?.stop();
          setTimeout(() => this.startRecording(), 1000);
        }
      }, this.SEGMENT_DURATION_MS);

      // Timer de tiempo transcurrido
      this.startElapsedTimer();

      this.updateUI(true, false);
      this.broadcastStatus({ recording: true, meetingTitle: this.meetingTitle });
      chrome.runtime.sendMessage({ type: 'RECORDING_STARTED' });

    } catch (err) {
      console.error('[ZRNote] Error starting recording:', err);
      throw err;
    }
  }

  async stopRecording() {
    if (!this.recording && !this.processing) return;

    this.recording = false;
    this.processing = true;

    if (this.segmentTimer) clearInterval(this.segmentTimer);
    if (this.elapsedTimer) clearInterval(this.elapsedTimer);

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }

    this.updateUI(false, true, 'Transcribiendo audio...');

    try {
      // Finalizar segmento actual
      await this.flushSegment();

      // Llamar a /finalize para iniciar pipeline completo
      const res = await fetch(`${this.API_BASE}/api/meetings/${this.meetingId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Error iniciando procesamiento');

      // Polling de estado
      this.pollProcessingStatus();

    } catch (err) {
      console.error('[ZRNote] Error stopping:', err);
      this.processing = false;
      this.updateUI(false, false);
    }
  }

  async callProcessStep(step) {
    const maxRetries = 60;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(`${this.API_BASE}/api/meetings/${this.meetingId}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step }),
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.ok) {
          // If more segments remain, keep polling
          if (data.more) {
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          return true;
        }

        // If step not ready yet (e.g., analyze before transcribe done), retry
        if (data.error?.includes('Invalid status') || data.error?.includes('Run transcribe step first')) {
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        // Fatal error
        console.error('[ZRNote] Step ' + step + ' failed:', data.error);
        return false;
      } catch (e) {
        console.warn('[ZRNote] Step ' + step + ' attempt ' + attempt + ' failed:', e);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    return false;
  }

  async pollProcessingStatus() {
    const steps = [
      { step: 'transcribe', label: 'Transcribiendo audio...' },
      { step: 'analyze', label: 'Generando minuta con IA...' },
      { step: 'vectorize', label: 'Indexando para búsqueda...' },
      { step: 'emails', label: 'Enviando correos...' },
    ];

    for (const { step, label } of steps) {
      if (!this.processing) break;
      this.updateUI(false, true, label);
      const ok = await this.callProcessStep(step);
      if (!ok) {
        this.processing = false;
        this.updateUI(false, false);
        return;
      }
    }

    if (this.processing) {
      this.processing = false;
      this.updateUI(false, false);
      chrome.runtime.sendMessage({ type: 'MINUTE_GENERATED' });
    }
  }

  async flushSegment() {
    if (this.chunks.length === 0) return;

    const blob = new Blob(this.chunks, { type: this.mimeType });
    this.chunks = [];

    // Compress if > 2MB (Vercel 4MB limit, Groq 25MB)
    const blobToUpload = blob.size > 2 * 1024 * 1024
      ? await maybeCompressAudio(blob)
      : blob;

    const formData = new FormData();
    const ext = this.mimeType.includes('mp4') ? 'mp4' : this.mimeType.includes('ogg') ? 'ogg' : 'webm';
    formData.append('audio', blobToUpload, `segment_${this.segmentIndex}.${ext}`);
    formData.append('segmentIndex', this.segmentIndex.toString());
    formData.append('meetingId', this.meetingId);

    try {
      const res = await fetch(`${this.API_BASE}/api/meetings/${this.meetingId}/upload-segment`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const err = await res.json();
        console.error('[ZRNote] Upload error:', err);
      } else {
        console.log('[ZRNote] Segment ' + this.segmentIndex + ' uploaded');
      }
    } catch (e) {
      console.error('[ZRNote] Upload failed:', e);
    }

    this.segmentIndex++;
  }

  startElapsedTimer() {
    this.startTime = Date.now();
    this.elapsedTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      this.broadcastStatus({ recording: true, elapsed });
      const timerEl = document.getElementById('zrnote-timer');
      if (timerEl) {
        const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        timerEl.textContent = h + ':' + m + ':' + s;
      }
    }, 1000);
  }

  broadcastStatus(status) {
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status }).catch(() => {});
  }

  getStatus() {
    return {
      recording: this.recording,
      processing: this.processing,
      meetingTitle: this.meetingTitle,
      elapsed: this.recording ? Math.floor((Date.now() - this.startTime) / 1000) : undefined,
    };
  }
}

// Inicializar cuando Meet esté listo
function waitForMeet() {
  return new Promise(resolve => {
    const check = () => {
      if (document.querySelector('[data-meeting-id]') || document.querySelector('.G5t3rd') || document.querySelector('[data-meeting-title]')) {
        resolve();
      } else {
        setTimeout(check, 1000);
      }
    };
    check();
  });
}

waitForMeet().then(() => {
  new MeetRecorder();
});