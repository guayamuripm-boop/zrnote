'use client';

// Does the microphone actually still work, right now?
//
// THE PROBLEM THIS SOLVES
// -----------------------
// Nothing in the recorder ever asked that question. `getUserMedia` was called
// once, and from then on the UI showed a running clock and an animated
// waveform no matter what happened to the hardware. In practice a capture on a
// phone dies for reasons that have nothing to do with our code:
//
//   • An incoming call, a WhatsApp voice note, or any other app grabbing the
//     mic ends our track outright (`ended`). Android does this routinely.
//   • A Bluetooth headset drops or switches profile → the track goes `muted`
//     and delivers digital silence until it comes back.
//   • The user walks away, covers the mic, or the phone is face-down on a desk.
//   • On a video call, the user stops sharing the meeting audio — the recording
//     silently loses every remote participant from that second on.
//
// In every case the old recorder kept "recording" happily and produced a file
// full of nothing. The user discovered it forty minutes later, when the server
// answered "no se detectó voz audible". That is the "no se escucha" complaint,
// and the fix is not better transcription — it is telling the user WHILE THERE
// IS STILL TIME TO ACT.
//
// So: track lifecycle is watched through events (reliable even with the screen
// off, because they come from the media pipeline, not from a JS timer), and
// loudness is sampled while the page is visible, which is exactly when the
// user can see a warning and do something about it.

export type MicIssue =
  /** The capture is gone. Recording cannot continue without re-acquiring it. */
  | 'track-ended'
  /** The OS silenced the track (another app, a Bluetooth switch). Recoverable. */
  | 'track-muted'
  /** The track is alive but nothing audible is reaching it. */
  | 'silence';

export interface MicHealthEvents {
  onIssue: (issue: MicIssue) => void;
  onRecovered: (issue: MicIssue) => void;
}

/**
 * Below this RMS a sample counts as silence. Deliberately low: room tone,
 * breathing and a distant speaker must all read as "we can hear something".
 * Only a genuinely dead or muted input sits under it.
 */
const SILENCE_RMS = 0.008;
/** How long silence must last before it is worth interrupting the user. */
const SILENCE_GRACE_MS = 20_000;

export interface WatchTargets {
  /**
   * The tracks whose life or death matters: the microphone, and the shared
   * meeting audio when there is one.
   *
   * These are the SOURCE tracks, never the mixed output. A mixed stream comes
   * out of a Web Audio destination node, and that track never ends, never
   * mutes and never reports a problem no matter what happens upstream — so
   * watching it would be watching nothing.
   */
  tracks: MediaStreamTrack[];
  /**
   * The stream to measure loudness on — the MIXED one, i.e. exactly what is
   * being recorded. "Is anything reaching the recording?" is the question
   * worth asking; whether an individual source is quiet is not.
   */
  analyse: MediaStream;
}

export interface MicWatchdog {
  /** Issues currently active. */
  active: () => Set<MicIssue>;
  /**
   * The current spectrum, for the waveform, or null when there is no analyser.
   *
   * The watchdog owns the only AudioContext on the recording screen: a second
   * one just for decoration would double the battery cost of the feature on
   * the device least able to afford it. The buffer is reused between frames,
   * so the caller must read it immediately and not hold on to it.
   */
  frequencies: () => Uint8Array | null;
  /** Point the watchdog at the rebuilt capture after a recovery. */
  attach: (targets: WatchTargets) => void;
  stop: () => void;
}

/**
 * Watch a capture stream and report when it stops being able to hear.
 *
 * Never throws: on a browser without AudioContext the loudness half simply
 * does not run, and the (far more important) track-lifecycle half still does.
 */
export function watchMicHealth(targets: WatchTargets, events: MicHealthEvents): MicWatchdog {
  const issues = new Set<MicIssue>();
  let stopped = false;
  let raf: number | null = null;
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let quietSince = 0;
  const trackCleanups: Array<() => void> = [];

  const raise = (issue: MicIssue) => {
    if (stopped || issues.has(issue)) return;
    issues.add(issue);
    events.onIssue(issue);
  };

  const clear = (issue: MicIssue) => {
    if (!issues.delete(issue)) return;
    if (!stopped) events.onRecovered(issue);
  };

  const bindTracks = (tracks: MediaStreamTrack[]) => {
    for (const cleanup of trackCleanups.splice(0)) cleanup();

    for (const track of tracks) {
      const onEnded = () => raise('track-ended');
      const onMute = () => raise('track-muted');
      const onUnmute = () => clear('track-muted');

      track.addEventListener('ended', onEnded);
      track.addEventListener('mute', onMute);
      track.addEventListener('unmute', onUnmute);
      trackCleanups.push(() => {
        track.removeEventListener('ended', onEnded);
        track.removeEventListener('mute', onMute);
        track.removeEventListener('unmute', onUnmute);
      });

      // A track can already be dead or muted by the time we get here (the user
      // took a call during the permission prompt), so check the state too —
      // events only tell us about transitions.
      if (track.readyState === 'ended') raise('track-ended');
      if (track.muted) raise('track-muted');
    }
  };

  const buildAnalyser = (s: MediaStream) => {
    try {
      source?.disconnect();
      source = null;
      if (!audioCtx) {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return;
        audioCtx = new Ctor();
      }
      if (audioCtx.state === 'suspended') void audioCtx.resume();
      if (!analyser) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        // Loudness must react within a second or two, not be averaged away.
        analyser.smoothingTimeConstant = 0.4;
      }
      source = audioCtx.createMediaStreamSource(s);
      source.connect(analyser);
    } catch {
      analyser = null;
    }
  };

  const buffer = new Float32Array(1024);
  // fftSize 1024 -> 512 frequency bins. Allocated once: this is read on every
  // animation frame, and a fresh array per frame is pure garbage collection.
  const spectrum = new Uint8Array(512);

  const sample = () => {
    if (stopped) return;
    raf = requestAnimationFrame(sample);
    if (!analyser) return;

    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    const rms = Math.sqrt(sum / buffer.length);

    // Silence only matters while the track is otherwise healthy — reporting it
    // on top of "track-ended" would just bury the real cause.
    if (issues.has('track-ended') || issues.has('track-muted')) {
      quietSince = 0;
      return;
    }

    if (rms < SILENCE_RMS) {
      if (!quietSince) quietSince = Date.now();
      else if (Date.now() - quietSince > SILENCE_GRACE_MS) raise('silence');
    } else {
      quietSince = 0;
      clear('silence');
    }
  };

  bindTracks(targets.tracks);
  buildAnalyser(targets.analyse);
  sample();

  return {
    active: () => new Set(issues),
    frequencies() {
      if (!analyser) return null;
      analyser.getByteFrequencyData(spectrum);
      return spectrum;
    },
    attach(next: WatchTargets) {
      issues.delete('track-ended');
      issues.delete('track-muted');
      quietSince = 0;
      bindTracks(next.tracks);
      buildAnalyser(next.analyse);
    },
    stop() {
      stopped = true;
      if (raf !== null) cancelAnimationFrame(raf);
      for (const cleanup of trackCleanups.splice(0)) cleanup();
      try {
        source?.disconnect();
      } catch {
        /* ignore */
      }
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
      audioCtx = null;
      analyser = null;
      source = null;
    },
  };
}

/** What the user is told, per issue. Plain language, and always actionable. */
export const MIC_ISSUE_MESSAGES: Record<MicIssue, string> = {
  'track-ended':
    'Se perdió el micrófono (otra app lo tomó, o se desconectó el manos libres). Estamos reconectándolo — el audio ya grabado está a salvo.',
  'track-muted':
    'El micrófono está silenciado por el sistema. Revisa que ninguna otra app lo esté usando y que el manos libres siga conectado.',
  silence:
    'Llevamos un rato sin escuchar nada. Acerca el teléfono a quien habla y comprueba que el micrófono no esté tapado.',
};
