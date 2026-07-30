'use client';

// Keeping a browser tab recording while the phone screen is off.
//
// What actually happens on a phone when the screen goes off:
//   • The page becomes `hidden`. JS timers (`setInterval`/`setTimeout`) are
//     throttled hard — on Android Chrome to roughly ONE tick per minute, and
//     after a few minutes a backgrounded page can be frozen outright.
//   • The screen Wake Lock is released automatically; it only holds while the
//     document is visible, so it cannot keep a recording alive by itself.
//   • An active `getUserMedia` capture DOES keep the page alive on Android…
//     but only reliably while the tab is treated as playing media.
//
// So two things are needed, and neither is a timer:
//   1. A silent looping <audio> element that is actually PLAYING. That makes the
//      browser treat the tab as an active media session, which is what stops it
//      from being frozen or discarded, and what surfaces the OS media
//      notification the user can see and stop.
//   2. `navigator.mediaSession` metadata + playbackState, so the notification
//      shows something meaningful and the hardware/lockscreen buttons work.
//
// iOS Safari suspends audio capture when the app leaves the foreground; no web
// API changes that. `backgroundRecordingSupport()` reports this honestly so the
// UI can warn instead of silently losing the meeting.

/** One second of silence, as a WAV data URI (~1KB, no network request). */
function silentWavDataUri(): string {
  const sampleRate = 8000;
  const seconds = 1;
  const samples = sampleRate * seconds;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, samples * 2, true);
  // Samples stay zeroed — that is the silence.

  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export type BackgroundSupport = 'good' | 'limited' | 'unsupported';

export interface BackgroundCapability {
  level: BackgroundSupport;
  message: string;
}

/**
 * What the user can realistically expect on THIS device, so the UI can say it
 * up front instead of letting them discover it after losing a meeting.
 */
export function backgroundRecordingSupport(): BackgroundCapability {
  if (typeof navigator === 'undefined') {
    return { level: 'limited', message: '' };
  }

  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    return {
      level: 'unsupported',
      message:
        'En iPhone y iPad, Safari corta la grabación al bloquear la pantalla o cambiar de app. Mantén ZRNote abierto y en primer plano — la pantalla puede atenuarse, pero no la bloquees.',
    };
  }

  const isAndroid = /Android/.test(ua);
  if (isAndroid) {
    return {
      level: 'good',
      message:
        'Puedes bloquear la pantalla: la grabación sigue y verás una notificación de ZRNote. No cierres la pestaña ni el navegador.',
    };
  }

  return {
    level: 'good',
    message: 'Puedes minimizar la ventana; la grabación continúa mientras la pestaña siga abierta.',
  };
}

/**
 * Holds the tab in a "playing media" state for as long as the recording lasts.
 * Returns a stop function. Safe to call in any browser: everything is guarded.
 */
export function startBackgroundKeepAlive(options: {
  title?: string;
  onPause?: () => void;
  onResume?: () => void;
}): () => void {
  let audio: HTMLAudioElement | null = null;

  try {
    audio = new Audio(silentWavDataUri());
    audio.loop = true;
    // Not 0: some browsers treat a fully muted element as "not playing media"
    // and skip the media session entirely, which defeats the whole point.
    audio.volume = 0.001;
    audio.setAttribute('playsinline', 'true');
    // Play must be triggered from the user gesture that started the recording;
    // if it is not, the promise rejects harmlessly and we just lose keep-alive.
    void audio.play().catch(() => {});
  } catch {
    audio = null;
  }

  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: options.title || 'Grabando reunión',
        artist: 'ZRNote',
        album: 'Grabación en curso',
      });
      navigator.mediaSession.playbackState = 'playing';
      if (options.onPause) navigator.mediaSession.setActionHandler('pause', options.onPause);
      if (options.onResume) navigator.mediaSession.setActionHandler('play', options.onResume);
    }
  } catch {
    /* MediaSession is best-effort */
  }

  return () => {
    try {
      if (audio) {
        audio.pause();
        audio.src = '';
        audio = null;
      }
    } catch {
      /* ignore */
    }
    try {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('play', null);
      }
    } catch {
      /* ignore */
    }
  };
}
