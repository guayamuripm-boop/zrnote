// ZRNote Meet Recorder - Content Script
// Se inyecta en meet.google.com

interface MeetingInfo {
  meetingId: string;
  title: string;
  participants: string[];
}

class ZRNoteRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private segmentIndex = 0;
  private recording = false;
  private meetingInfo: MeetingInfo | null = null;
  private uiContainer: HTMLElement | null = null;
  private apiBase = 'https://zrnote.vercel.app'; // Cambiar en desarrollo
  private segmentTimer: NodeJS.Timeout | null = null;
  private readonly SEGMENT_DURATION_MS = 30 * 60 * 1000; // 30 min
  private readonly FLUSH_INTERVAL_MS = 30 * 1000; // 30 seg

  constructor() {
    this.init();
  }

  private async init() {
    // Esperar a que Meet cargue
    await this.waitForMeet();
    this.extractMeetingInfo();
    this.injectUI();
    this.setupMessageListener();
  }

  private waitForMeet(): Promise<void> {
    return new Promise((resolve) => {
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

  private extractMeetingInfo() {
    // Extraer ID de reunión de la URL o DOM
    const urlMatch = window.location.href.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
    const meetingId = urlMatch ? urlMatch[1] : `meet_${Date.now()}`;

    // Título de la reunión
    const titleEl = document.querySelector('[data-meeting-title]') || document.querySelector('h1');
    const title = titleEl?.textContent?.trim() || 'Google Meet';

    // Participantes (aproximado)
    const participants = Array.from(document.querySelectorAll('[data-participant-id]'))
      .map(el => el.getAttribute('aria-label') || el.textContent?.trim())
      .filter(Boolean);

    this.meetingInfo = { meetingId, title, participants: participants as string[] };
    console.log('[ZRNote] Meeting info:', this.meetingInfo);
  }

  private injectUI() {
    if (this.uiContainer) return;

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
          <small>Reunión: ${this.meetingInfo?.title || 'Detectando...'}</small>
          <small>ID: ${this.meetingInfo?.meetingId || '-'}</small>
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
      .zrnote-btn.primary {
        background: #2563eb;
        color: white;
      }
      .zrnote-btn.primary:hover { background: #1d4ed8; }
      .zrnote-btn.danger {
        background: #ef4444;
        color: white;
      }
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
    document.getElementById('zrnote-start')?.addEventListener('click', () => this.startRecording());
    document.getElementById('zrnote-stop')?.addEventListener('click', () => this.stopRecording());
  }

  private async startRecording() {
    if (this.recording) return;

    try {
      // Solicitar captura de pestaña con audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 }, // Baja tasa, solo para mantener la pestaña activa
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Detectar cuando el usuario detiene la captura nativa
      const videoTrack = stream.getVideoTracks()[0];
      videoTrack?.addEventListener('ended', () => {
        if (this.recording) this.stopRecording();
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 32000,
      });

      this.chunks = [];
      this.segmentIndex = 0;
      this.recording = true;

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        await this.flushSegment();
      };

      this.mediaRecorder.start(1000); // Evento cada segundo

      // Timer para flush periódico
      this.segmentTimer = setInterval(() => {
        if (this.recording && this.chunks.length > 0) {
          this.flushSegment();
        }
      }, this.FLUSH_INTERVAL_MS);

      // Auto-stop al llegar a límite de segmento
      setTimeout(() => {
        if (this.recording) {
          this.mediaRecorder?.stop();
          // Reiniciar grabador para siguiente segmento
          setTimeout(() => this.startRecording(), 1000);
        }
      }, this.SEGMENT_DURATION_MS);

      this.updateUIRecording(true);
      this.startTimer();

    } catch (err) {
      console.error('[ZRNote] Error starting recording:', err);
      alert('Error al iniciar grabación: ' + (err as Error).message);
    }
  }

  private async flushSegment() {
    if (this.chunks.length === 0) return;

    const blob = new Blob(this.chunks, { type: 'audio/webm;codecs=opus' });
    this.chunks = [];

    const formData = new FormData();
    formData.append('audio', blob, `segment_${this.segmentIndex}.webm`);
    formData.append('segmentIndex', this.segmentIndex.toString());
    formData.append('meetingId', this.meetingInfo?.meetingId || 'unknown');

    try {
      const res = await fetch(`${this.apiBase}/api/meetings/${this.meetingInfo?.meetingId}/upload-segment`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        console.log(`[ZRNote] Segment ${this.segmentIndex} uploaded`);
        this.segmentIndex++;
      } else {
        console.error('[ZRNote] Upload failed:', await res.text());
      }
    } catch (err) {
      console.error('[ZRNote] Upload error:', err);
    }
  }

  private async stopRecording() {
    if (!this.recording) return;

    this.recording = false;

    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }

    // Flush final
    await this.flushSegment();

    // Detener MediaRecorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // Detener tracks
    this.mediaRecorder?.stream?.getTracks().forEach(t => t.stop());

    // Llamar a finalize
    try {
      await fetch(`${this.apiBase}/api/meetings/${this.meetingInfo?.meetingId}/finalize`, {
        method: 'POST',
      });
      console.log('[ZRNote] Meeting finalized');
    } catch (err) {
      console.error('[ZRNote] Finalize error:', err);
    }

    this.updateUIRecording(false);
    this.stopTimer();

    // Mostrar éxito
    this.showNotification('Grabación finalizada. Procesando en ZRNote...');
  }

  private updateUIRecording(recording: boolean) {
    const startBtn = document.getElementById('zrnote-start');
    const stopBtn = document.getElementById('zrnote-stop');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const timer = document.getElementById('zrnote-timer');

    if (recording) {
      startBtn!.style.display = 'none';
      stopBtn!.style.display = 'flex';
      timer!.style.display = 'block';
      statusDot!.classList.add('recording');
      statusText!.textContent = 'Grabando...';
    } else {
      startBtn!.style.display = 'flex';
      stopBtn!.style.display = 'none';
      timer!.style.display = 'none';
      statusDot!.classList.remove('recording');
      statusText!.textContent = 'Listo para grabar';
    }
  }

  private timerInterval: NodeJS.Timeout | null = null;
  private elapsed = 0;

  private startTimer() {
    this.elapsed = 0;
    this.timerInterval = setInterval(() => {
      this.elapsed++;
      const h = Math.floor(this.elapsed / 3600).toString().padStart(2, '0');
      const m = Math.floor((this.elapsed % 3600) / 60).toString().padStart(2, '0');
      const s = (this.elapsed % 60).toString().padStart(2, '0');
      document.getElementById('zrnote-timer')!.textContent = `${h}:${m}:${s}`;
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private showNotification(message: string) {
    const notif = document.createElement('div');
    notif.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #10b981;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      z-index: 2147483647;
      animation: slideIn 0.3s ease;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 5000);
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'GET_STATUS') {
        sendResponse({ recording: this.recording, meetingInfo: this.meetingInfo });
      }
    });
  }
}

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ZRNoteRecorder());
} else {
  new ZRNoteRecorder();
}