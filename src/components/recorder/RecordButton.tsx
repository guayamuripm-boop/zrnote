'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { runMeetingPipeline, PipelineStep, STEP_LABELS } from '@/lib/pipeline-client';
import {
  backgroundRecordingSupport,
  startBackgroundKeepAlive,
  type BackgroundCapability,
} from '@/lib/background-audio';
import {
  saveSegment,
  markSession,
  pendingSegments,
  dropMeeting,
  requestPersistentStorage,
} from '@/lib/recording-store';
import { SegmentUploader, type QueueStatus } from '@/lib/upload-queue';
import { watchMicHealth, MIC_ISSUE_MESSAGES, type MicIssue, type MicWatchdog } from '@/lib/mic-health';
import {
  systemAudioSupported,
  requestSystemAudio,
  mixCapture,
  SystemAudioDeclined,
  SystemAudioWithoutSound,
  SYSTEM_AUDIO_MESSAGES,
  type CaptureMode,
  type MixedCapture,
} from '@/lib/audio-mixer';

type RecordingState =
  | 'idle'
  | 'recording'
  | 'paused'
  /** The capture died and is being rebuilt. Audio already captured is safe. */
  | 'recovering'
  | 'uploading'
  | 'processing';
type ProcessingStep = PipelineStep;

interface RecordButtonProps {
  meetingId: string;
  meetingTitle?: string;
  onFinalized?: () => void;
}

// One segment = one full MediaRecorder session (start→stop), so every uploaded
// file is independently decodable. 30s es el tope de lo que una catástrofe
// puede costar: si el teléfono se bloquea, el navegador se cae o iOS suspende
// el tab justo ahora, se pierde COMO MUCHO el ultimo trozo de esta duración
// (menos, casi siempre — ver `handleVisibilityChange`, que rota al bloquear).
// Bajado de 60s a 30s tras un caso real en el que un usuario perdió cerca de
// un minuto de clase al bloquear el móvil.
const SEGMENT_DURATION_MS = 30 * 1000;

// 32 kbps mono Opus is transparent for speech — Opus was designed for voice at
// this rate, and Whisper hears no difference. The previous 128 kbps produced
// files FOUR TIMES larger for no transcription benefit, which mattered in the
// only place it could hurt: a 60s segment sat near 1MB against Vercel's 4.5MB
// body cap, so a single missed rotation lost the audio outright, and every
// upload took four times longer to survive on a weak connection.
const AUDIO_BITS_PER_SECOND = 32_000;

/** No chunk for this long means the recorder has stalled, whatever it claims. */
const CHUNK_STALL_MS = 25_000;
/** How often the stall check runs. Throttled in the background — that is fine:
 *  the check is against wall-clock timestamps, so a late tick still detects it. */
const STALL_CHECK_MS = 10_000;
/** Attempts to re-acquire the microphone before admitting defeat. */
const MAX_RECOVERY_ATTEMPTS = 5;

// How often to transcribe what has already been uploaded, WHILE still
// recording. Groq's free tier allows 20 requests a minute, so a 45-minute
// class could never be transcribed in under a couple of minutes — but those
// minutes used to be spent entirely after the user pressed "Finalizar",
// staring at a spinner, while the 45 minutes of recording before it sat idle.
// One pass a minute keeps pace with one 60s segment a minute, so by the time
// recording stops there is usually nothing left to do but the last segment.
//
// Browsers throttle background timers to roughly one tick a minute, which is
// exactly this cadence — so being backgrounded costs this nothing.
const LIVE_TRANSCRIBE_EVERY_MS = 60_000;

export default function RecordButton({ meetingId, meetingTitle, onFinalized }: RecordButtonProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState<ProcessingStep | null>(null);
  const [processingMessage, setProcessingMessage] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [background, setBackground] = useState<BackgroundCapability | null>(null);
  const [micIssue, setMicIssue] = useState<MicIssue | null>(null);
  const [queue, setQueue] = useState<QueueStatus>({ pending: 0, failed: 0, uploading: false, offline: false });
  /** Audio found on the device from a recording that never finished. */
  const [orphanSegments, setOrphanSegments] = useState(0);
  /** Microphone only, or microphone + the audio of the call. */
  const [captureMode, setCaptureMode] = useState<CaptureMode>('mic');
  const [canShareSystem, setCanShareSystem] = useState(false);
  const [sharingSystem, setSharingSystem] = useState(false);
  /** Segments already transcribed while the recording is still going. */
  const [liveTranscribed, setLiveTranscribed] = useState(0);
  /** Segundos de audio ya escritos a disco (device o server), acumulados por
   *  segmento cerrado. Es el numero que el usuario necesita ver: "ya tengo
   *  esto asegurado, si todo falla ahora, no lo pierdo". */
  const [savedSeconds, setSavedSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  /** The mixed capture being recorded, plus the sources that feed it. */
  const captureRef = useRef<MixedCapture | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const stallTimerRef = useRef<NodeJS.Timeout | null>(null);
  const liveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const liveBusyRef = useRef(false);
  /** Held so finalize can wait for an in-flight pass instead of racing it. */
  const liveInFlightRef = useRef<Promise<void> | null>(null);
  const stopKeepAliveRef = useRef<(() => void) | null>(null);
  const uploaderRef = useRef<SegmentUploader | null>(null);
  const watchdogRef = useRef<MicWatchdog | null>(null);
  // Wall-clock anchors. Counting `setInterval` ticks loses time whenever the
  // browser throttles timers (which is exactly what happens with the screen
  // off), so both the elapsed display and the pause bookkeeping are derived
  // from timestamps instead.
  const recordingStartedAtRef = useRef<number>(0);
  const pausedTotalMsRef = useRef(0);
  const pausedAtRef = useRef<number>(0);
  // When a recorder stops, decide whether it's a segment rotation (restart)
  // or the final stop (resolve finalize). See startNewRecorder().
  const shouldRestartRef = useRef(false);
  const finalizeResolveRef = useRef<(() => void) | null>(null);
  const segmentCountRef = useRef(0);
  // Where THIS session's segment numbering starts. A meeting that already holds
  // audio (e.g. a failed run the user is recording again, or a second take)
  // must not have its existing segments overwritten by a fresh 0,1,2…
  const baseSegmentIndexRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const isRecordingRef = useRef(false);
  const rotateSegmentRef = useRef<(() => void) | null>(null);
  const recoverRef = useRef<(() => void) | null>(null);
  const recoveringRef = useRef(false);

  const meetingIdRef = useRef(meetingId);
  const segmentStartTimeRef = useRef<number>(Date.now());
  const lastChunkAtRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');

  meetingIdRef.current = meetingId;

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const uploader = useCallback(() => {
    if (!uploaderRef.current) {
      uploaderRef.current = new SegmentUploader(meetingIdRef.current);
      uploaderRef.current.subscribe(setQueue);
    }
    return uploaderRef.current;
  }, []);

  // `ondataavailable` is driven by the MEDIA pipeline, not by a JS timer, so it
  // keeps firing on schedule even when the page is hidden and timers are being
  // throttled to ~1/min. That makes it the only reliable clock for closing a
  // segment while the phone screen is off — with `setInterval` the rotation
  // simply stopped happening, and the "segment" grew until it blew past the
  // 4MB upload cap and was lost.
  const handleDataAvailable = useCallback((event: BlobEvent) => {
    lastChunkAtRef.current = Date.now();
    if (event.data.size > 0) {
      chunksRef.current.push(event.data);
    }
    if (
      isRecordingRef.current &&
      Date.now() - segmentStartTimeRef.current >= SEGMENT_DURATION_MS
    ) {
      rotateSegmentRef.current?.();
    }
  }, []);

  // Assemble ALL chunks of the current recorder session into ONE complete,
  // self-contained media file (header + data), WRITE IT TO DISK, and let the
  // durable queue take it from there.
  //
  // The write comes first and the upload second, deliberately: from this point
  // on the audio survives the tab being killed, the browser crashing, or the
  // phone running out of battery. Nothing downstream can lose it any more.
  const collectSegment = useCallback(() => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
    chunksRef.current = [];
    if (blob.size === 0) return;

    const index = baseSegmentIndexRef.current + segmentCountRef.current;
    const durationSec = Math.round((Date.now() - segmentStartTimeRef.current) / 1000);
    segmentStartTimeRef.current = Date.now();
    segmentCountRef.current++;
    setSegmentCount(segmentCountRef.current);
    // Todo lo que llega hasta aqui esta a punto de ir a disco (ver el .then),
    // asi que a efectos del usuario "ya esta a salvo". Sumar la duracion real
    // de cada segmento cerrado es mas honesto que multiplicar `segmentCount`
    // por el nominal de 30s, porque los que rota `handleVisibilityChange` al
    // bloquear duran menos.
    setSavedSeconds((prev) => prev + Math.max(0, durationSec));

    const id = meetingIdRef.current;
    void saveSegment({ meetingId: id, index, blob, mime: mimeTypeRef.current, durationSec })
      .then(() => {
        void markSession(id, { title: meetingTitle || '', state: 'recording' });
        void uploader().drain();
      });
  }, [meetingTitle, uploader]);

  // Create and start a fresh MediaRecorder on the live stream. Each session
  // begins a new container, so every produced segment carries its own header.
  const startNewRecorder = useCallback((): boolean => {
    const capture = captureRef.current;
    // Without this guard the caller went on to call `.start()` on the OLD,
    // already-stopped recorder, which either throws or silently records from a
    // dead stream. Recovery is the correct response, not pretending it worked.
    //
    // The liveness check looks at the SOURCE tracks: a mixed stream's own
    // track stays alive forever regardless of what died upstream.
    if (!capture || capture.sourceTracks.every((t) => t.readyState === 'ended')) {
      return false;
    }
    const stream = capture.stream;

    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(stream, {
        mimeType: mimeTypeRef.current,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
    } catch {
      return false;
    }

    chunksRef.current = [];
    segmentStartTimeRef.current = Date.now();
    lastChunkAtRef.current = Date.now();

    mr.ondataavailable = handleDataAvailable;
    // A recorder error used to be invisible: the capture stopped, the clock
    // kept running, and the user recorded nothing for the rest of the meeting.
    mr.onerror = () => {
      if (isRecordingRef.current) recoverRef.current?.();
    };
    mr.onstop = () => {
      // A stop finalizes the container → chunks form ONE valid file.
      collectSegment();
      if (shouldRestartRef.current) {
        // Segment rotation: immediately begin the next segment.
        shouldRestartRef.current = false;
        if (startNewRecorder()) {
          try {
            mediaRecorderRef.current?.start(1000);
          } catch {
            recoverRef.current?.();
          }
        } else {
          recoverRef.current?.();
        }
      } else if (finalizeResolveRef.current) {
        // Final stop requested by finalizeRecording().
        const resolve = finalizeResolveRef.current;
        finalizeResolveRef.current = null;
        resolve();
      }
    };

    mediaRecorderRef.current = mr;
    return true;
  }, [handleDataAvailable, collectSegment]);

  // Close the current segment and open the next one. Stopping the recorder
  // is the ONLY way to get a standalone, decodable audio file — slicing a
  // continuous stream yields headerless fragments Whisper rejects with 400.
  const rotateSegment = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      shouldRestartRef.current = true;
      try {
        mr.stop();
      } catch {
        recoverRef.current?.();
      }
    }
  }, []);

  // handleDataAvailable is created before rotateSegment and must not capture a
  // stale copy of it; the ref breaks the cycle.
  rotateSegmentRef.current = rotateSegment;

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      /* Wake Lock is unsupported or denied; the keep-alive audio carries on. */
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  };

  const buildMicStream = async () =>
    navigator.mediaDevices.getUserMedia({
      audio: {
        // Echo cancellation matters more than usual here: on a video call the
        // remote voices come out of the speakers and straight back into this
        // microphone. Without it they are recorded twice, slightly apart,
        // which is exactly what makes a call recording sound hollow.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

  /** Re-mix whatever sources are currently alive and point the watchdog at it. */
  const applyCapture = useCallback((capture: MixedCapture) => {
    captureRef.current = capture;
    watchdogRef.current?.attach({ tracks: capture.sourceTracks, analyse: capture.stream });
  }, []);

  /**
   * Rebuild the capture after it died, without losing the meeting.
   *
   * Previously ANY of the causes below ended the recording silently and the
   * user kept staring at a running clock: another app taking the microphone,
   * a Bluetooth headset dropping, the recorder erroring out, or the media
   * pipeline stalling. Now every one of them lands here, the already-captured
   * audio is already on disk, and the recording simply continues in a new
   * segment once the hardware comes back.
   */
  const recoverCapture = useCallback(async () => {
    if (recoveringRef.current || !isRecordingRef.current) return;
    recoveringRef.current = true;
    setState('recovering');

    try {
      // Salvage whatever the dead recorder already produced. `onstop` may not
      // fire on a broken recorder, so the chunks are collected by hand.
      const mr = mediaRecorderRef.current;
      shouldRestartRef.current = false;
      finalizeResolveRef.current = null;
      if (mr && mr.state !== 'inactive') {
        try {
          mr.onstop = null;
          mr.stop();
        } catch {
          /* it is already broken; the chunks below are what matter */
        }
      }
      collectSegment();

      // The shared meeting audio is kept if it is still alive. Re-asking for it
      // is impossible anyway — `getDisplayMedia` needs a fresh click, and there
      // is nobody clicking in the middle of a recovery.
      const previous = captureRef.current;
      const survivingSystem =
        previous?.systemStream && previous.systemStream.getAudioTracks().some((t) => t.readyState === 'live')
          ? previous.systemStream
          : null;

      previous?.micStream?.getTracks().forEach((t) => t.stop());
      if (!survivingSystem) previous?.systemStream?.getTracks().forEach((t) => t.stop());
      captureRef.current = null;

      for (let attempt = 1; attempt <= MAX_RECOVERY_ATTEMPTS; attempt++) {
        if (!isRecordingRef.current) return;
        try {
          const micStream = await buildMicStream();
          applyCapture(mixCapture(micStream, survivingSystem));
          if (startNewRecorder()) {
            mediaRecorderRef.current?.start(1000);

            setMicIssue(null);
            setState('recording');
            setWarning(
              'Se perdió el micrófono un momento y se reconectó solo. El audio grabado hasta ahora está a salvo.',
            );
            return;
          }
        } catch {
          /* the mic is still held by whatever took it; wait and try again */
        }
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }

      // Out of attempts. The audio is safe on disk, so the honest move is to
      // close the recording cleanly and process what we have — not to keep a
      // dead recorder on screen pretending to record.
      isRecordingRef.current = false;
      setError(
        'No se pudo recuperar el micrófono (puede que otra app lo esté usando). Se guardó todo lo grabado hasta ahora: pulsa «Finalizar» para generar la minuta con ese audio.',
      );
      setState('paused');
    } finally {
      recoveringRef.current = false;
    }
  }, [collectSegment, startNewRecorder, applyCapture]);

  recoverRef.current = () => {
    void recoverCapture();
  };

  const handleVisibilityChange = useCallback(async () => {
    if (document.visibilityState === 'hidden' && isRecordingRef.current) {
      // Cierra el segmento en curso YA — cualquier cosa capturada hasta este
      // instante queda en IndexedDB. El umbral era 5s por miedo a producir
      // clips que el servidor descartara por "demasiado pequeños"; bajado a
      // 1.5s tras un caso real de pérdida: un segundo y medio de audio vale
      // mucho más que perderlo. El servidor sólo tira lo verdaderamente
      // sub-segundo. Y en iOS, si mr.stop() no responde (Safari suspende
      // audio en background), al volver al foreground `recoverCapture`
      // salvará lo que haya quedado con `collectSegment()`.
      if (Date.now() - segmentStartTimeRef.current > 1500) {
        rotateSegment();
      }
    } else if (document.visibilityState === 'visible' && isRecordingRef.current) {
      // The screen wake lock is dropped by the browser whenever the document
      // stops being visible, so it has to be taken again on the way back.
      if (!wakeLockRef.current) {
        await requestWakeLock();
      }
      // Coming back is also the moment to check the capture survived being
      // backgrounded — on some devices it does not.
      if (Date.now() - lastChunkAtRef.current > CHUNK_STALL_MS) {
        void recoverCapture();
      }
    }
  }, [rotateSegment, recoverCapture]);

  const stopVisualizer = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const initCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  const drawVisualizer = useCallback(() => {
    const canvas = canvasRef.current;
    const watchdog = watchdogRef.current;
    if (!canvas || !watchdog) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dataArray = watchdog.frequencies();
    const bufferLength = dataArray?.length ?? 0;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const barCount = 48;
    const gap = 2;
    const barWidth = (w - (barCount - 1) * gap) / barCount;

    // No analyser (an old WebView, a blocked AudioContext): draw the idle
    // shimmer rather than nothing, so the screen never looks broken.
    const avg = dataArray ? dataArray.reduce((a, b) => a + b, 0) / bufferLength : 0;
    const isSilent = avg < 12;

    for (let i = 0; i < barCount; i++) {
      const idx = Math.floor((i / barCount) * bufferLength);
      const raw = dataArray ? dataArray[idx] / 255 : 0;
      const value = isSilent ? 0.02 + Math.sin(Date.now() / 800 + i * 0.5) * 0.01 : raw;

      const barH = Math.max(value * h * 0.9, 1.5);
      const x = i * (barWidth + gap);
      const y = h - barH;

      if (isSilent) {
        const gray = 200 + Math.sin(Date.now() / 1000 + i * 0.3) * 15;
        ctx.fillStyle = `rgba(${gray}, ${gray}, ${gray}, 0.3)`;
      } else {
        const hue = 210 + value * 50;
        const sat = 70 + value * 25;
        const lit = 45 + value * 35;
        ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`;
      }

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, barWidth, barH, 2);
      } else {
        ctx.rect(x, y, barWidth, barH);
      }
      ctx.fill();
    }

    animFrameRef.current = requestAnimationFrame(drawVisualizer);
  }, []);

  const startRecording = async () => {
    // Sharing the meeting audio has to be asked for FIRST, before anything is
    // awaited. `getDisplayMedia` demands a fresh user gesture, and a single
    // `await` in front of it is enough to spend the one this click carries —
    // the picker then never appears and the call is recorded without the
    // people on the other side.
    let systemStream: MediaStream | null = null;
    let systemNotice: string | null = null;

    if (captureMode === 'mic+system') {
      try {
        systemStream = await requestSystemAudio();
      } catch (err) {
        // Neither case is fatal: recording with the microphone alone is worse
        // than the full mix but far better than not recording the meeting.
        systemNotice =
          err instanceof SystemAudioWithoutSound
            ? SYSTEM_AUDIO_MESSAGES.withoutSound
            : err instanceof SystemAudioDeclined
              ? SYSTEM_AUDIO_MESSAGES.declined
              : SYSTEM_AUDIO_MESSAGES.declined;
      }
    }

    try {
      // Ask the browser to stop treating our buffered audio as disposable
      // cache. Without it Android may evict IndexedDB mid-meeting — precisely
      // when a long recording is what filled it.
      void requestPersistentStorage();

      // Where this session's segment numbering starts.
      //
      // The server knows about every segment it has REGISTERED, and that used
      // to be the whole answer. It is not: segments can be sitting on this
      // device having never reached the server (an interrupted recording, a
      // dead zone), and the server cannot see those. Starting a new take at
      // the server's count therefore reuses their numbers — and since a
      // segment is keyed `meetingId:index` on disk, the new recording would
      // OVERWRITE the audio of the unfinished one. That is precisely the loss
      // the durable store exists to prevent, so both sources are consulted and
      // the higher one wins.
      let serverNext = 0;
      try {
        const res = await fetch(`/api/meetings/${meetingIdRef.current}/direct-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'begin' }),
        });
        const data = await res.json().catch(() => ({}));
        // Failing this is not fatal — worst case we fall back to what is on the
        // device, which on a fresh meeting is nothing, i.e. 0.
        serverNext = res.ok ? Number(data.nextIndex) || 0 : 0;
      } catch {
        serverNext = 0;
      }

      const localPending = await pendingSegments(meetingIdRef.current);
      const localNext = localPending.reduce((max, seg) => Math.max(max, seg.index + 1), 0);
      baseSegmentIndexRef.current = Math.max(serverNext, localNext);

      const micStream = await buildMicStream();
      const capture = mixCapture(micStream, systemStream);
      captureRef.current = capture;
      setSharingSystem(capture.hasSystemAudio);

      // The shared audio can be stopped from Chrome's own "Dejar de compartir"
      // bar, which is outside this UI entirely. Recording carries on with the
      // microphone — but the user has to be told, or they will believe the
      // remote voices are still being captured.
      for (const track of systemStream?.getAudioTracks() ?? []) {
        track.addEventListener('ended', () => {
          setSharingSystem(false);
          if (isRecordingRef.current) setWarning(SYSTEM_AUDIO_MESSAGES.ended);
        });
      }

      const mimeTypes = [
        'audio/webm',
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
      mimeTypeRef.current = mimeType;

      chunksRef.current = [];
      segmentCountRef.current = 0;
      shouldRestartRef.current = false;
      finalizeResolveRef.current = null;

      setSegmentCount(0);
      setElapsed(0);
      setError(null);
      setWarning(systemNotice);
      setMicIssue(null);
      setOrphanSegments(0);
      setLiveTranscribed(0);
      isRecordingRef.current = true;

      recordingStartedAtRef.current = Date.now();
      pausedTotalMsRef.current = 0;
      pausedAtRef.current = 0;

      // Watch the hardware for the whole session. Track events fire from the
      // media pipeline, so they keep working with the screen off.
      watchdogRef.current = watchMicHealth({ tracks: capture.sourceTracks, analyse: capture.stream }, {
        onIssue: (issue) => {
          setMicIssue(issue);
          if (issue === 'track-ended') void recoverCapture();
        },
        onRecovered: (issue) => {
          setMicIssue((cur) => (cur === issue ? null : cur));
        },
      });

      // The recorder emits a chunk every second; that event is what closes a
      // segment (see handleDataAvailable) — no JS timer is involved, so the
      // rotation keeps working with the screen off.
      if (!startNewRecorder()) {
        throw new Error('MediaRecorder no pudo iniciarse');
      }
      mediaRecorderRef.current?.start(1000);
      await markSession(meetingIdRef.current, { title: meetingTitle || '', state: 'recording' });
      void uploader().drain();

      // Purely cosmetic: the displayed time is RECOMPUTED from timestamps, so
      // even if this tick is throttled to once a minute the clock stays right.
      timerRef.current = setInterval(() => {
        setElapsed(
          Math.floor(
            (Date.now() - recordingStartedAtRef.current - pausedTotalMsRef.current) / 1000,
          ),
        );
      }, 1000);

      // The last line of defence: if chunks simply stop arriving, the capture
      // is dead no matter what `mediaRecorder.state` says.
      stallTimerRef.current = setInterval(() => {
        if (!isRecordingRef.current || recoveringRef.current) return;
        if (Date.now() - lastChunkAtRef.current > CHUNK_STALL_MS) void recoverCapture();
      }, STALL_CHECK_MS);

      // Transcribe as we go, so "Finalizar" has almost nothing left to do.
      liveTimerRef.current = setInterval(() => {
        liveInFlightRef.current = pumpLiveTranscription();
      }, LIVE_TRANSCRIBE_EVERY_MS);

      setState('recording');

      await requestWakeLock();
      // Started from within the click handler, so the browser accepts the
      // silent-audio playback that keeps the tab alive in the background.
      stopKeepAliveRef.current = startBackgroundKeepAlive({
        title: meetingTitle || 'Grabando reunión',
        onPause: () => pauseRecording(),
        onResume: () => resumeRecording(),
      });

      document.addEventListener('visibilitychange', handleVisibilityChange);
    } catch (err) {
      isRecordingRef.current = false;
      // The share was granted but the microphone was not: do not leave the
      // user's screen being captured by a recording that never started.
      systemStream?.getTracks().forEach((t) => t.stop());
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'No diste permiso para usar el micrófono. Actívalo en los ajustes del navegador y vuelve a intentarlo.'
          : 'No se pudo acceder al micrófono. Verifica que ninguna otra app lo esté usando.',
      );
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      isRecordingRef.current = false;
      pausedAtRef.current = Date.now();
      stopVisualizer();
      if (timerRef.current) clearInterval(timerRef.current);
      try {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      } catch { /* best effort */ }
      setState('paused');
    }
  };

  const resumeRecording = () => {
    // The recorder is gone, not paused: this is the state left behind when
    // recovery ran out of attempts. The button used to be a no-op here — the
    // user pressed "Reanudar", nothing happened, and nothing explained why.
    // Trying again is the only sensible meaning of that press.
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      setError(null);
      isRecordingRef.current = true;
      void recoverCapture();
      return;
    }

    if (mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      isRecordingRef.current = true;
      lastChunkAtRef.current = Date.now();

      // Discount the paused stretch so the elapsed clock stays honest, and
      // push the segment deadline forward so the pause does not instantly
      // trigger a rotation on the next chunk.
      if (pausedAtRef.current) {
        const pausedMs = Date.now() - pausedAtRef.current;
        pausedTotalMsRef.current += pausedMs;
        segmentStartTimeRef.current += pausedMs;
        pausedAtRef.current = 0;
      }

      timerRef.current = setInterval(() => {
        setElapsed(
          Math.floor(
            (Date.now() - recordingStartedAtRef.current - pausedTotalMsRef.current) / 1000,
          ),
        );
      }, 1000);

      try {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      } catch { /* best effort */ }

      setState('recording');
    }
  };

  /**
   * Transcribe what has already been uploaded, without stopping the recording.
   *
   * Three conditions, each protecting something specific:
   *
   *  • Still recording. A pass that starts as the user presses "Finalizar"
   *    would append to the transcript at the same time as the real pipeline —
   *    the same minute of the meeting, twice.
   *  • Online. Offline this is a guaranteed-failed request and a wasted radio
   *    wake-up; the audio is safe locally and gets transcribed later anyway.
   *  • The upload queue is EMPTY. This is the subtle one: a segment still
   *    being retried belongs BEFORE ones already uploaded, and transcribing
   *    past it would leave it permanently behind the marker — its minute of
   *    the meeting silently absent from the transcript. Waiting until nothing
   *    is in flight means the order is settled before anything is read.
   *
   * Every failure is swallowed on purpose. This is opportunistic work: the
   * real pipeline runs at the end regardless and redoes whatever was missed.
   */
  const pumpLiveTranscription = useCallback(async () => {
    if (liveBusyRef.current || !isRecordingRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    liveBusyRef.current = true;
    try {
      const stillQueued = await pendingSegments(meetingIdRef.current);
      if (stillQueued.length > 0 || !isRecordingRef.current) return;

      const res = await fetch(`/api/meetings/${meetingIdRef.current}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'transcribe', live: true }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (typeof data?.segmentsProcessed === 'number') {
        setLiveTranscribed(data.segmentsProcessed);
      }
    } catch {
      /* opportunistic: the pipeline at the end is what actually guarantees it */
    } finally {
      liveBusyRef.current = false;
    }
  }, []);

  /** Shared by "Finalizar" and by the recovery of an interrupted session. */
  const runPipeline = useCallback(async () => {
    setState('processing');
    setProcessingStep('transcribe');
    setProcessingMessage('Transcribiendo el audio…');

    const result = await runMeetingPipeline(meetingIdRef.current, (p) => {
      setProcessingStep(p.step);
      setProcessingMessage(
        p.segmentsTotal ? `${p.label} (${p.segmentsProcessed}/${p.segmentsTotal})` : p.label,
      );
    });

    // Only NOW is the keep-alive no longer needed. It used to be released
    // before this loop ran, which left the longest and most fragile phase of
    // the whole product — transcribing forty segments over a mobile network —
    // running in a tab the browser was free to freeze. Locking the screen
    // during processing was enough to strand the meeting on "procesando".
    stopKeepAliveRef.current?.();
    stopKeepAliveRef.current = null;
    await releaseWakeLock();

    if (!result.ok) {
      setError(result.error || 'No se pudo procesar la grabación.');
      setState('idle');
      setProcessingStep(null);
      return;
    }

    // The pipeline finished, so the audio buffered on the device has done its
    // job and the session no longer counts as interrupted.
    await markSession(meetingIdRef.current, { state: 'done' });
    void dropMeeting(meetingIdRef.current);

    if (result.warning) setWarning(result.warning);
    setProcessingStep(null);
    setProcessingMessage('¡Listo!');
    onFinalized?.();
  }, [onFinalized]);

  const finalizeRecording = async () => {
    // Set FIRST: it is what stops a new live-transcription pass from starting
    // while this one is tearing the recording down.
    isRecordingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (stallTimerRef.current) clearInterval(stallTimerRef.current);
    if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    await markSession(meetingIdRef.current, { state: 'finalizing' });

    // Final stop: do NOT restart. The recorder's onstop collects the last
    // (complete) segment and resolves this promise via finalizeResolveRef.
    await new Promise<void>((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') {
        collectSegment();
        resolve();
        return;
      }
      shouldRestartRef.current = false;
      finalizeResolveRef.current = resolve;
      // A recorder that never fires `onstop` (it is already broken) must not
      // hang the finalize forever — take what we have and move on.
      const bail = setTimeout(() => {
        if (finalizeResolveRef.current) {
          finalizeResolveRef.current = null;
          collectSegment();
          resolve();
        }
      }, 5000);
      const done = () => clearTimeout(bail);
      try {
        mr.stop();
      } catch {
        done();
        collectSegment();
        finalizeResolveRef.current = null;
        resolve();
        return;
      }
      captureRef.current?.stop();
      void Promise.resolve().then(done);
    });

    stopVisualizer();
    watchdogRef.current?.stop();
    watchdogRef.current = null;

    setState('uploading');
    // Everything captured is on disk; this drains it to the server. It is safe
    // to take as long as it needs — nothing is lost by waiting.
    const drained = await uploader().waitUntilDrained();

    if (segmentCountRef.current === 0 && drained.pending === 0 && drained.failed === 0) {
      setError('No se capturó audio. Revisa que el micrófono tenga permiso y vuelve a grabar.');
      setState('idle');
      stopKeepAliveRef.current?.();
      stopKeepAliveRef.current = null;
      await releaseWakeLock();
      return;
    }

    if (drained.failed > 0) {
      setWarning(
        `${drained.failed} fragmento(s) siguen sin subirse (guardados en este dispositivo). La minuta puede quedar incompleta; vuelve a esta pantalla con conexión para completarla.`,
      );
    }

    // A live pass already in flight is reading and appending to the very same
    // transcript the pipeline is about to. Waiting for it costs a second at
    // most and is the difference between a clean transcript and one with a
    // minute of the meeting written into it twice.
    await liveInFlightRef.current?.catch(() => {});

    await runPipeline();
  };

  /** Finish a recording whose tab died before the pipeline ever ran. */
  const recoverInterrupted = async () => {
    setError(null);
    setState('uploading');
    const drained = await uploader().waitUntilDrained();
    setOrphanSegments(drained.pending + drained.failed);
    if (drained.failed > 0 && drained.pending === 0) {
      setWarning(`${drained.failed} fragmento(s) no se pudieron subir. Se procesará el resto.`);
    }
    // A live pass already in flight is reading and appending to the very same
    // transcript the pipeline is about to. Waiting for it costs a second at
    // most and is the difference between a clean transcript and one with a
    // minute of the meeting written into it twice.
    await liveInFlightRef.current?.catch(() => {});

    await runPipeline();
  };

  // Device capabilities depend on the user agent, so this can only run in the
  // browser (never during SSR).
  useEffect(() => {
    setBackground(backgroundRecordingSupport());
    setCanShareSystem(systemAudioSupported());
  }, []);

  // Audio left on the device by a recording that never finished. Finding it and
  // saying so is the difference between "se me borró la clase" and "pulsa aquí".
  useEffect(() => {
    let cancelled = false;
    void pendingSegments(meetingId).then((segs) => {
      if (!cancelled) setOrphanSegments(segs.length);
    });
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  useEffect(() => {
    if (state !== 'recording') return;
    initCanvasSize();
    drawVisualizer();
    return stopVisualizer;
  }, [state, drawVisualizer, initCanvasSize, stopVisualizer]);

  // Leaving mid-recording is the one irreversible mistake left, so ask first.
  // (Browsers ignore custom text, but the prompt itself is what matters.)
  useEffect(() => {
    if (state !== 'recording' && state !== 'paused' && state !== 'recovering') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (stallTimerRef.current) clearInterval(stallTimerRef.current);
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
      watchdogRef.current?.stop();
      uploaderRef.current?.dispose();
      stopKeepAliveRef.current?.();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      // Stopping the recorder's own stream is NOT enough: that stream is the
      // mixer's output, and its track has no connection to the hardware.
      // Releasing the capture is what turns off the microphone light and takes
      // down Chrome's "estás compartiendo tu pantalla" bar — leaving either of
      // those on after the user walked away would be its own small betrayal.
      captureRef.current?.stop();
      captureRef.current = null;
    };
  }, [handleVisibilityChange]);

  const isLive = state === 'recording' || state === 'paused' || state === 'recovering';

  return (
    <div className="flex flex-col items-center gap-8">
      {error && (
        <div className="w-full max-w-md bg-rose-100 dark:bg-rose-900/30 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 gradient-error rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-rose-600 dark:text-rose-400 text-sm font-medium">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {warning && (
        <div className="w-full max-w-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 flex items-start gap-3">
          <span className="text-lg leading-none">⚠️</span>
          <p className="flex-1 text-amber-700 dark:text-amber-400 text-sm">{warning}</p>
          <button onClick={() => setWarning(null)} className="text-amber-400 hover:text-amber-600 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* The microphone stopped hearing. Said WHILE the meeting is still
          happening, which is the only moment it is worth anything. */}
      {micIssue && isLive && (
        <div
          className={`w-full max-w-md rounded-xl p-4 flex items-start gap-3 border ${
            micIssue === 'silence'
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40'
              : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/40'
          }`}
        >
          <span className="text-lg leading-none">{micIssue === 'silence' ? '🔇' : '🎙️'}</span>
          <p
            className={`flex-1 text-sm ${
              micIssue === 'silence'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {MIC_ISSUE_MESSAGES[micIssue]}
          </p>
        </div>
      )}

      {/* Audio recovered from a recording that never finished. */}
      {state === 'idle' && orphanSegments > 0 && (
        <div className="w-full max-w-md rounded-xl p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-lg leading-none">💾</span>
            <p className="flex-1 text-sm text-blue-800 dark:text-blue-300">
              Encontramos {orphanSegments} fragmento{orphanSegments !== 1 ? 's' : ''} de una
              grabación anterior guardados en este dispositivo. No se perdieron.
            </p>
          </div>
          <button
            onClick={recoverInterrupted}
            className="w-full gradient-primary text-white rounded-xl py-2.5 text-sm font-medium"
          >
            Recuperar y generar la minuta
          </button>
        </div>
      )}

      {/* Videollamada o reunión presencial. Preguntado ANTES de grabar, porque
          después ya no se puede arreglar: el micrófono de un portátil capta a
          los participantes remotos como un rebote lejano del altavoz, si es que
          los capta. */}
      {state === 'idle' && canShareSystem && (
        <div className="w-full max-w-md glass rounded-2xl p-4 space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Qué vas a grabar
          </p>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setCaptureMode('mic')}
              className={`text-left rounded-xl p-3 border transition ${
                captureMode === 'mic'
                  ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-900/20 dark:border-blue-500'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                🎙️ Una reunión presencial
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Solo el micrófono. Para gente hablando en la misma sala.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode('mic+system')}
              className={`text-left rounded-xl p-3 border transition ${
                captureMode === 'mic+system'
                  ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-900/20 dark:border-blue-500'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                💻 Una videollamada (Meet, Zoom, Teams…)
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tu micrófono y además el audio de la llamada, para que se oiga a
                todos con claridad.
              </span>
            </button>
          </div>
          {captureMode === 'mic+system' && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5 leading-relaxed">
              Al pulsar «Grabar», Chrome te pedirá qué compartir. Elige{' '}
              <strong>la pestaña de la reunión</strong> (o la pantalla entera si usas
              la app de Zoom) y <strong>marca la casilla de compartir el audio</strong> —
              sin esa casilla no se graba a los demás.
            </p>
          )}
        </div>
      )}

      {/* Say up front what this device can do, instead of letting the user find
          out by losing a meeting. */}
      {state === 'idle' && background && background.message && (
        <div
          className={`w-full max-w-md rounded-xl p-4 flex items-start gap-3 ${
            background.level === 'unsupported'
              ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40'
              : 'glass'
          }`}
        >
          <span className="text-base leading-none">
            {background.level === 'unsupported' ? '⚠️' : '🔒'}
          </span>
          <p
            className={`flex-1 text-xs leading-relaxed ${
              background.level === 'unsupported'
                ? 'text-amber-800 dark:text-amber-300'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {background.message}
          </p>
        </div>
      )}

      {state !== 'idle' && (
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            {(state === 'recording' || state === 'paused') && (
              <span className={`w-3 h-3 rounded-full ${state === 'recording' ? 'bg-rose-500 animate-pulse dark:bg-rose-400' : 'bg-amber-400 dark:bg-amber-500'}`} />
            )}
            {(state === 'uploading' || state === 'recovering' || state === 'processing') && (
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            )}
            <span className="text-4xl sm:text-5xl font-light text-slate-900 dark:text-slate-100 tracking-wider tabular-nums">
              {formatTime(elapsed)}
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {state === 'recording' && (
                savedSeconds > 0
                  ? `≈ ${Math.max(1, Math.round(savedSeconds / 60))} min ya a salvo${segmentCount > 0 ? ` · ${segmentCount} fragmento${segmentCount !== 1 ? 's' : ''}` : ''}`
                  : segmentCount > 0
                    ? `${segmentCount} fragmento${segmentCount !== 1 ? 's' : ''}`
                    : 'Grabando…'
              )}
              {state === 'paused' && 'En pausa'}
              {state === 'recovering' && 'Reconectando el micrófono…'}
              {state === 'uploading' && 'Guardando el audio…'}
              {state === 'processing' && processingStep && STEP_LABELS[processingStep]}
            </p>

            {/* What the upload queue is doing. Silence here used to hide a
                meeting that was quietly failing to reach the server. */}
            {isLive && (queue.pending > 0 || queue.failed > 0 || queue.offline) && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {queue.offline
                  ? `Sin conexión — ${queue.pending} fragmento(s) esperando en el teléfono. Se subirán solos.`
                  : queue.failed > 0
                    ? `${queue.failed} fragmento(s) con problemas, guardados en el teléfono.`
                    : `Subiendo… ${queue.pending} fragmento(s) en cola.`}
              </p>
            )}

            {state === 'uploading' && queue.pending > 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Quedan {queue.pending} fragmento(s) por subir.
              </p>
            )}

            {/* Says out loud that the wait at the end is already being eaten
                into — and, when it is not, stays quiet rather than claiming it. */}
            {isLive && liveTranscribed > 0 && (
              <p className="text-xs flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span>✍️</span>
                {liveTranscribed} fragmento{liveTranscribed === 1 ? '' : 's'} ya transcrito
                {liveTranscribed === 1 ? '' : 's'} — al finalizar casi no habrá espera
              </p>
            )}

            {state === 'recording' && captureMode === 'mic+system' && (
              <p
                className={`text-xs flex items-center justify-center gap-1 ${
                  sharingSystem
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                <span>{sharingSystem ? '💻' : '⚠️'}</span>
                {sharingSystem
                  ? 'Grabando también el audio de la llamada'
                  : 'Solo micrófono — no se está captando la llamada'}
              </p>
            )}

            {state === 'recording' && background && (
              <p
                className={`text-xs flex items-center justify-center gap-1 ${
                  background.level === 'unsupported'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <span>{background.level === 'unsupported' ? '⚠️' : '🔒'}</span>
                {background.level === 'unsupported'
                  ? 'No bloquees la pantalla ni cambies de app'
                  : 'Puedes bloquear la pantalla o cambiar de app'}
              </p>
            )}
          </div>
        </div>
      )}

      {state === 'recording' && (
        <div className="w-full max-w-sm glass rounded-2xl p-3 sm:p-4 shadow-elevated">
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="w-full h-16 sm:h-20 rounded-xl"
              style={{ display: 'block' }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-wider uppercase">Audio en vivo</span>
          </div>
        </div>
      )}

      <div className="relative">
        {state === 'idle' && (
          <button
            onClick={startRecording}
            className="group relative w-40 h-40 sm:w-48 sm:h-48 rounded-full gradient-primary hover:shadow-2xl hover:shadow-blue-500/30 text-white font-semibold transition-all duration-300 hover:scale-105 flex flex-col items-center justify-center gap-2"
          >
            <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping" style={{ animationDuration: '2s' }} />
            <svg className="w-12 h-12 sm:w-14 sm:h-14 relative z-10" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            <span className="relative z-10">Grabar</span>
          </button>
        )}

        {state === 'recording' && (
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              onClick={pauseRecording}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 flex flex-col items-center justify-center gap-1"
            >
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
              <span className="text-[10px]">Pausa</span>
            </button>
            <button
              onClick={finalizeRecording}
              className="w-32 h-32 sm:w-36 sm:h-36 rounded-full gradient-primary hover:shadow-2xl hover:shadow-blue-500/30 text-white font-semibold transition-all duration-300 hover:scale-105 flex flex-col items-center justify-center gap-2"
            >
              <svg className="w-10 h-10 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              <span>Finalizar</span>
            </button>
          </div>
        )}

        {state === 'paused' && (
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              onClick={resumeRecording}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 flex flex-col items-center justify-center gap-1"
            >
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span className="text-[10px]">Reanudar</span>
            </button>
            <button
              onClick={finalizeRecording}
              className="w-32 h-32 sm:w-36 sm:h-36 rounded-full gradient-primary hover:shadow-2xl hover:shadow-blue-500/30 text-white font-semibold transition-all duration-300 hover:scale-105 flex flex-col items-center justify-center gap-2"
            >
              <svg className="w-10 h-10 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              <span>Finalizar</span>
            </button>
          </div>
        )}

        {(state === 'uploading' || state === 'recovering') && (
          <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-full gradient-primary text-white font-semibold flex flex-col items-center justify-center gap-3 shadow-xl text-center px-6">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-sm">
              {state === 'uploading' ? 'Guardando…' : 'Reconectando…'}
            </span>
          </div>
        )}

        {state === 'processing' && processingStep && (
          <div className="w-full max-w-sm space-y-3 text-center">
            <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{processingMessage}</p>
              <div className="flex justify-center gap-1.5">
                {(['transcribe', 'analyze', 'emails'] as ProcessingStep[]).map((s, i) => {
                  const current = ['transcribe', 'analyze', 'emails'].indexOf(processingStep);
                  const labels = { transcribe: 'Transcribir', analyze: 'Minuta', emails: 'Correos' } as const;
                  return (
                    <span
                      key={s}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-medium ${
                        i < current
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : i === current
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 animate-pulse'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {labels[s]}
                    </span>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Puede tardar unos minutos. Si se corta, el audio está guardado y puedes
                retomarlo desde la reunión.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
