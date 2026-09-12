'use client';

// Recording a video call from the browser: the meeting audio AND your own voice.
//
// THE PROBLEM
// -----------
// A microphone records the room. In a video call, the other participants are
// not in the room — they come out of the speakers, and a phone-style mic
// capture picks them up as a thin, echoey rebound off the desk, if at all.
// Recording a Meet or a Zoom with `getUserMedia` alone gives you a minute in
// which only one person is intelligible: whoever is holding the laptop.
//
// The browser can do better. `getDisplayMedia` can capture the audio of a tab
// or of the whole system, straight from the audio pipeline, with no room and
// no speakers in between. Mixed with the microphone, that is the full call:
// remote voices at source quality, local voice from the mic.
//
// WHAT MAKES OR BREAKS THE RESULT
// -------------------------------
// Two sources summed naively clip. Two people talking at once — the normal
// state of a meeting — pushes the sum past full scale, and the result is
// distortion, which Whisper transcribes as garbage or as nothing. So the gain
// staging here is deliberate: each source is attenuated to leave headroom, and
// a limiter catches whatever still peaks. It is the difference between "se
// escucha perfecto" and an unusable recording.

export type CaptureMode = 'mic' | 'mic+system';

export interface MixedCapture {
  /** The single stream to hand to MediaRecorder. */
  stream: MediaStream;
  micStream: MediaStream | null;
  systemStream: MediaStream | null;
  /** Live audio tracks from every source, for the health watchdog. */
  sourceTracks: MediaStreamTrack[];
  /** True when the user asked for system audio and actually granted it. */
  hasSystemAudio: boolean;
  stop(): void;
}

/**
 * `getDisplayMedia` exists on desktop browsers only. On Android and iOS there
 * is no such thing as capturing another app's audio from a web page, so the
 * option must never be offered there — an unavailable feature presented as a
 * choice is worse than no choice.
 */
export function systemAudioSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    // A coarse pointer with no hover is a phone or tablet; the API may be
    // present but always fails there.
    !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
  );
}

export class SystemAudioDeclined extends Error {
  constructor() {
    super('SYSTEM_AUDIO_DECLINED');
    this.name = 'SystemAudioDeclined';
  }
}

export class SystemAudioWithoutSound extends Error {
  constructor() {
    super('SYSTEM_AUDIO_WITHOUT_SOUND');
    this.name = 'SystemAudioWithoutSound';
  }
}

/**
 * Ask the user to share the meeting's audio.
 *
 * MUST be called synchronously from a click — `getDisplayMedia` requires a
 * fresh user gesture and an `await` before it is enough to lose one.
 *
 * The single biggest trap in this API is that it succeeds with NO audio track:
 * the user picks a window (windows cannot share audio at all) or forgets the
 * "Share tab audio" / "Share system audio" checkbox. The share looks fine, the
 * recording has no meeting in it, and nobody finds out until the minute is
 * empty. So that case is detected here and reported as its own error, with its
 * own instructions.
 */
export async function requestSystemAudio(): Promise<MediaStream> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      // Video has to be requested: no browser offers audio-only display
      // capture. The track is disabled immediately below — we never look at
      // the picture, but the share dies if the track is stopped.
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch {
    throw new SystemAudioDeclined();
  }

  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new SystemAudioWithoutSound();
  }

  // Keep the capture alive, stop paying for frames we never read.
  stream.getVideoTracks().forEach((t) => {
    t.enabled = false;
  });

  return stream;
}

/** Attenuation per source. Two at 0.72 sum to 1.44 worst case, which the
 *  limiter below brings back under full scale without audible pumping. */
const MIC_GAIN = 0.72;
const SYSTEM_GAIN = 0.72;

/**
 * Mix the sources into one stream that will not clip.
 *
 * When there is no system audio this is still worth going through: the limiter
 * also tames a microphone that someone speaks into from ten centimetres away,
 * which is the other classic way a recording arrives distorted.
 */
export function mixCapture(micStream: MediaStream | null, systemStream: MediaStream | null): MixedCapture {
  const Ctor = (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) as
    | typeof AudioContext
    | undefined;

  const sourceTracks = [
    ...(micStream?.getAudioTracks() ?? []),
    ...(systemStream?.getAudioTracks() ?? []),
  ];
  const hasSystemAudio = Boolean(systemStream && systemStream.getAudioTracks().length > 0);

  // Nothing to mix, or no Web Audio at all: hand back the microphone untouched
  // rather than failing. A plain mic recording is the product's baseline and
  // must never depend on the mixer working.
  if (!Ctor || !hasSystemAudio) {
    const only = micStream ?? systemStream;
    if (!only) throw new Error('No hay ninguna fuente de audio que grabar.');
    return {
      stream: only,
      micStream,
      systemStream,
      sourceTracks,
      hasSystemAudio,
      stop() {
        micStream?.getTracks().forEach((t) => t.stop());
        systemStream?.getTracks().forEach((t) => t.stop());
      },
    };
  }

  const ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();

  const destination = ctx.createMediaStreamDestination();

  // A limiter, not a compressor: a high ratio with a hard knee and a fast
  // attack, so it does nothing at all until something is about to clip and
  // then catches only that. Speech below the threshold passes untouched.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(destination);

  const connect = (stream: MediaStream | null, gainValue: number) => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(gain).connect(limiter);
  };

  connect(micStream, MIC_GAIN);
  connect(systemStream, SYSTEM_GAIN);

  // Nothing is connected to `ctx.destination` on purpose. With
  // `getDisplayMedia` the shared tab keeps playing through the speakers by
  // itself, so routing it again would double it — and routing the microphone
  // there would put the user's own voice in their headphones on a delay.

  return {
    stream: destination.stream,
    micStream,
    systemStream,
    sourceTracks,
    hasSystemAudio,
    stop() {
      micStream?.getTracks().forEach((t) => t.stop());
      systemStream?.getTracks().forEach((t) => t.stop());
      if (ctx.state !== 'closed') ctx.close().catch(() => {});
    },
  };
}

/** What the user is told when sharing the meeting audio did not work out. */
export const SYSTEM_AUDIO_MESSAGES = {
  declined:
    'No se compartió el audio de la reunión, así que se grabará solo con el micrófono. Puedes parar y volver a empezar si quieres incluirlo.',
  withoutSound:
    'Compartiste la pantalla pero SIN el audio. Vuelve a intentarlo y marca la casilla «Compartir el audio de la pestaña» (o «del sistema») abajo a la izquierda del cuadro que sale. Si eliges una ventana suelta, Chrome no deja compartir su audio: elige una pestaña o la pantalla entera.',
  ended:
    'Dejaste de compartir el audio de la reunión. Se sigue grabando con el micrófono — pulsa «Finalizar» si ya terminaste.',
} as const;
