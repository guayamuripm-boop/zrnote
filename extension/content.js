// ZRNote Meet Recorder - Content Script
// Se inyecta en meet.google.com

interface Status {
  recording: boolean;
  processing: boolean;
  meetingTitle?: string;
  step?: string;
  elapsed?: number;
}

class MeetRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private segmentIndex = 0;
  private recording = false;
  private processing = false;
  private meetingId: string;
  private meetingTitle: string;
  private startTime = 0;
  private segmentTimer: NodeJS.Timeout | null = null;
  private elapsedTimer: NodeJS.Timeout | null = null;
  private API_BASE = 'https://zrnote.vercel.app';
  private readonly SEGMENT_DURATION_MS = 30 * 60 * 1000; // 30 min
  private readonly FLUSH_INTERVAL_MS = 30 * 1000; // 30 seg

  constructor() {
    this.meetingId = this.extractMeetingId();
    this.meetingTitle = this.extractMeetingTitle();
    this.init();
  }

  private extractMeetingId(): string {
    // URL: https://meet.google.com/abc-defg-hij
    const match = window.location.href.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
    return match ? match[1] : `meet_${Date.now()}`;
  }

  private extractMeetingTitle(): string {
    // Intentar varios selectores
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

  private async init() {
    // Cargar URL configurada desde storage
    const data = await chrome.storage.sync.get(['zrnote_backend_url']);
    if (data.zrnote_backend_url) {
      this.API_BASE = data.zrnote_backend_url.replace(/\/+$/, '');
    }

    // Escuchar mensajes del popup/background
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      this.handleMessage(msg, sendResponse);
      return true; // async
    });

    // Notificar que content script está listo
    this.broadcastStatus({ recording: false, processing: false });
  }

  private handleMessage(msg: any, sendResponse: (response: any) => void) {
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

  private getStatus(): Status {
    return {
      recording: this.recording,
      processing: this.processing,
      meetingTitle: this.meetingTitle,
      elapsed: this.recording ? Math.floor((Date.now() - this.startTime) / 1000) : undefined,
    };
  }

  private async startRecording() {
    if (this.recording) return;

    try {
      // Solicitar captura de pestaña con audio
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 2 }, // Mínimo video para mantener pestaña activa
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

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 32000,
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
          // Reiniciar para siguiente segmento
          setTimeout(() => this.startRecording(), 1000);
        }
      }, this.SEGMENT_DURATION_MS);

      // Timer de tiempo transcurrido
      this.startElapsedTimer();

      this.broadcastStatus({ recording: true, meetingTitle: this.meetingTitle });
      chrome.runtime.sendMessage({ type: 'RECORDING_STARTED' });

    } catch (err) {
      console.error('[ZRNote] Error starting recording:', err);
      throw err;
    }
  }

  private async stopRecording() {
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

    this.broadcastStatus({ recording: false, processing: true, meetingTitle: this.meetingTitle, step: 'Transcribiendo audio...' });

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
      this.broadcastStatus({ recording: false, processing: false });
    }
  }

  private async callProcessStep(step: string): Promise<boolean> {
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
        console.error(`[ZRNote] Step ${step} failed:`, data.error);
        return false;
      } catch (e) {
        console.warn(`[ZRNote] Step ${step} attempt ${attempt} failed:`, e);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    return false;
  }

  private async pollProcessingStatus() {
    const steps = [
      { step: 'transcribe', label: 'Transcribiendo audio...' },
      { step: 'analyze', label: 'Generando minuta con IA...' },
      { step: 'vectorize', label: 'Indexando para búsqueda...' },
      { step: 'emails', label: 'Enviando correos...' },
    ];

    for (const { step, label } of steps) {
      if (!this.processing) break;
      this.broadcastStatus({ recording: false, processing: true, step: label });
      const ok = await this.callProcessStep(step);
      if (!ok) {
        this.processing = false;
        this.broadcastStatus({ recording: false, processing: false });
        return;
      }
    }

    if (this.processing) {
      this.processing = false;
      this.broadcastStatus({ recording: false, processing: false });
      chrome.runtime.sendMessage({ type: 'MINUTE_GENERATED' });
    }
  }

  private async flushSegment() {
    if (this.chunks.length === 0) return;

    const blob = new Blob(this.chunks, { type: 'audio/webm;codecs=opus' });
    this.chunks = [];

    const formData = new FormData();
    formData.append('audio', blob, `segment_${this.segmentIndex}.webm`);
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
        console.log(`[ZRNote] Segment ${this.segmentIndex} uploaded`);
      }
    } catch (e) {
      console.error('[ZRNote] Upload failed:', e);
    }

    this.segmentIndex++;
  }

  private startElapsedTimer() {
    this.startTime = Date.now();
    this.elapsedTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      this.broadcastStatus({ recording: true, elapsed });
    }, 1000);
  }

  private broadcastStatus(status: Status) {
    // Enviar a popup si está abierto
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status }).catch(() => {});
  }

  private getStatus(): Status {
    return {
      recording: this.recording,
      processing: this.processing,
      meetingTitle: this.meetingTitle,
      elapsed: this.recording ? Math.floor((Date.now() - this.startTime) / 1000) : undefined,
    };
  }
}

// Inicializar cuando Meet esté listo
function waitForMeet(): Promise<void> {
  return new Promise(resolve => {
    const check = () => {
      if (document.querySelector('[data-meeting-id]') || 
          document.querySelector('.G5t3rd') ||
          document.querySelector('[data-meeting-title]')) {
        resolve();
      } else {
        setTimeout(check, 1000);
      }
    };
    check();
  }

waitForMeet().then(() => {
  new MeetRecorder();
});