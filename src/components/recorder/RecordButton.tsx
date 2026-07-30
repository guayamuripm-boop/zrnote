'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { maybeCompressAudio } from '@/lib/audio-compression';
import { runMeetingPipeline, PipelineStep, STEP_LABELS } from '@/lib/pipeline-client';
import {
  backgroundRecordingSupport,
  startBackgroundKeepAlive,
  type BackgroundCapability,
} from '@/lib/background-audio';

type RecordingState = 'idle' | 'recording' | 'paused' | 'uploading' | 'finalizing' | 'processing';
type ProcessingStep = PipelineStep;

interface RecordButtonProps {
  meetingId: string;
  meetingTitle?: string;
  onFinalized?: () => void;
}

// One segment = one full MediaRecorder session (start→stop), so every uploaded
// file is independently decodable. 60s instead of 30s halves the number of
// Whisper calls and gives the model more context per call, while staying far
// under the 4MB upload cap (60s @128kbps ≈ 1MB).
const SEGMENT_DURATION_MS = 60 * 1000;

export default function RecordButton({ meetingId, meetingTitle, onFinalized }: RecordButtonProps) {
  // Force fresh deploy: 2026-07-18
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState<ProcessingStep | null>(null);
  const [processingMessage, setProcessingMessage] = useState('');
  const [failedSegments, setFailedSegments] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [background, setBackground] = useState<BackgroundCapability | null>(null);
  // Uploads keep failing (or not) AFTER finalizeRecording() captured its render
  // closure, so the count has to be read from a ref, not from state.
  const failedSegmentsRef = useRef(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const stopKeepAliveRef = useRef<(() => void) | null>(null);
  // Wall-clock anchors. Counting `setInterval` ticks loses time whenever the
  // browser throttles timers (which is exactly what happens with the screen
  // off), so both the elapsed display and the pause bookkeeping are derived
  // from timestamps instead.
  const recordingStartedAtRef = useRef<number>(0);
  const pausedTotalMsRef = useRef(0);
  const pausedAtRef = useRef<number>(0);
  const pendingUploadsRef = useRef<Promise<void>[]>([]);
  // Serializes segment uploads so the server-side read-modify-write of
  // meetings.audio_segments never races (concurrent uploads = lost segments).
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
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
  const meetingIdRef = useRef(meetingId);
  const segmentStartTimeRef = useRef<number>(Date.now());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
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

  const getExt = useCallback(() => {
    const mt = mimeTypeRef.current;
    return mt.includes('mp4') ? 'mp4' : mt.includes('ogg') ? 'ogg' : 'webm';
  }, []);

  const uploadSegmentOnce = async (blob: Blob, index: number, durationSec?: number) => {
    const blobToUpload = await maybeCompressAudio(blob, 2);
    
    const ext = getExt();
    
    const formData = new FormData();
    formData.append('audio', blobToUpload, `segment_${index}.${ext}`);
    formData.append('segmentIndex', index.toString());
    if (durationSec !== undefined) {
      formData.append('durationSec', durationSec.toString());
    }

    const response = await fetch(`/api/meetings/${meetingIdRef.current}/upload-segment`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }
  };

  const uploadSegment = async (blob: Blob, index: number, durationSec?: number, maxAttempts = 3) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await uploadSegmentOnce(blob, index, durationSec);
        return;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  };

  // `ondataavailable` is driven by the MEDIA pipeline, not by a JS timer, so it
  // keeps firing on schedule even when the page is hidden and timers are being
  // throttled to ~1/min. That makes it the only reliable clock for closing a
  // segment while the phone screen is off — with `setInterval` the rotation
  // simply stopped happening, and the "segment" grew until it blew past the
  // 4MB upload cap and was lost.
  const handleDataAvailable = useCallback((event: BlobEvent) => {
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

  // Enqueue an upload on the serial chain. Uploads run one at a time so the
  // server's read-modify-write of audio_segments cannot drop entries.
  const enqueueUpload = useCallback((blob: Blob, index: number, durationSec: number) => {
    const run = () =>
      uploadSegment(blob, index, durationSec).catch((err) => {
        console.error(`Segment ${index} upload failed after retries:`, err);
        failedSegmentsRef.current += 1;
        setFailedSegments(failedSegmentsRef.current);
      });
    uploadChainRef.current = uploadChainRef.current.then(run);
    pendingUploadsRef.current.push(uploadChainRef.current);
  }, []);

  // Assemble ALL chunks of the current recorder session into ONE complete,
  // self-contained media file (header + data) and queue it for upload.
  // This is only ever called from a recorder's `onstop`, guaranteeing the
  // container is properly finalized and therefore decodable by Whisper.
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

    enqueueUpload(blob, index, durationSec);
  }, [enqueueUpload]);

  // Create and start a fresh MediaRecorder on the live stream. Each session
  // begins a new container, so every produced segment carries its own header.
  const startNewRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const mr = new MediaRecorder(stream, {
      mimeType: mimeTypeRef.current,
      audioBitsPerSecond: 128000,
    });
    chunksRef.current = [];
    segmentStartTimeRef.current = Date.now();

    mr.ondataavailable = handleDataAvailable;
    mr.onstop = () => {
      // A stop finalizes the container → chunks form ONE valid file.
      collectSegment();
      if (shouldRestartRef.current) {
        // Segment rotation: immediately begin the next segment.
        shouldRestartRef.current = false;
        startNewRecorder();
        mediaRecorderRef.current?.start(1000);
      } else if (finalizeResolveRef.current) {
        // Final stop requested by finalizeRecording().
        const resolve = finalizeResolveRef.current;
        finalizeResolveRef.current = null;
        resolve();
      }
    };

    mediaRecorderRef.current = mr;
  }, [handleDataAvailable, collectSegment]);

  // Close the current segment and open the next one. Stopping the recorder
  // is the ONLY way to get a standalone, decodable audio file — slicing a
  // continuous stream yields headerless fragments Whisper rejects with 400.
  const rotateSegment = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      shouldRestartRef.current = true;
      mr.stop();
    }
  }, []);

  // handleDataAvailable is created before rotateSegment and must not capture a
  // stale copy of it; the ref breaks the cycle.
  rotateSegmentRef.current = rotateSegment;

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        const wakeLock = await navigator.wakeLock.request('screen');
        wakeLockRef.current = wakeLock;
        /* wake lock state is tracked via wakeLockRef */

        wakeLock.addEventListener('release', () => {
          /* wake lock state is tracked via wakeLockRef */
        });
      }
    } catch (err) {
      console.log('Wake Lock not supported or denied:', err);
      /* wake lock state is tracked via wakeLockRef */
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      /* wake lock state is tracked via wakeLockRef */
    }
  };

  const handleVisibilityChange = useCallback(async () => {
    if (document.visibilityState === 'hidden' && isRecordingRef.current) {
      // Close the current segment so whatever has been captured so far is
      // already safe on the server — but only if it holds enough audio to be
      // worth a file. Rotating on a segment that just started would produce a
      // sub-second clip that the server discards as "too small".
      if (Date.now() - segmentStartTimeRef.current > 5000) {
        rotateSegment();
      }
    } else if (document.visibilityState === 'visible' && isRecordingRef.current) {
      // The screen wake lock is dropped by the browser whenever the document
      // stops being visible, so it has to be taken again on the way back.
      if (!wakeLockRef.current) {
        await requestWakeLock();
      }
    }
  }, [rotateSegment]);

  const stopVisualizer = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
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
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const barCount = 48;
    const gap = 2;
    const barWidth = (w - (barCount - 1) * gap) / barCount;

    const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
    const isSilent = avg < 12;

    for (let i = 0; i < barCount; i++) {
      const idx = Math.floor((i / barCount) * bufferLength);
      const raw = dataArray[idx] / 255;
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

  const setupVisualizer = useCallback(async (stream: MediaStream) => {
    stopVisualizer();
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      sourceRef.current = source;
      initCanvasSize();
      drawVisualizer();
    } catch (e) {
      console.warn('Audio visualizer not supported:', e);
    }
  }, [stopVisualizer, drawVisualizer, initCanvasSize]);

  const startRecording = async () => {
    try {
      // Ask the server where our numbering starts before capturing anything.
      // Failing this is not fatal — worst case we start at 0 on a meeting that
      // has no audio, which is the normal case anyway.
      try {
        const res = await fetch(`/api/meetings/${meetingIdRef.current}/direct-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'begin' }),
        });
        const data = await res.json().catch(() => ({}));
        baseSegmentIndexRef.current = res.ok ? Number(data.nextIndex) || 0 : 0;
      } catch {
        baseSegmentIndexRef.current = 0;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

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
      console.log('[RecordButton] Using mimeType:', mimeType);
      mimeTypeRef.current = mimeType;

      chunksRef.current = [];
      segmentCountRef.current = 0;
      pendingUploadsRef.current = [];
      uploadChainRef.current = Promise.resolve();
      shouldRestartRef.current = false;
      finalizeResolveRef.current = null;
      failedSegmentsRef.current = 0;
      setSegmentCount(0);
      setFailedSegments(0);
      setElapsed(0);
      setError(null);
      setWarning(null);
      isRecordingRef.current = true;

      // Start the first segment recorder. Each segment is a full recorder
      // session (stop/restart), so every uploaded file is independently decodable.
      recordingStartedAtRef.current = Date.now();
      pausedTotalMsRef.current = 0;
      pausedAtRef.current = 0;

      // The recorder emits a chunk every second; that event is what closes a
      // segment (see handleDataAvailable) — no JS timer is involved, so the
      // rotation keeps working with the screen off.
      startNewRecorder();
      mediaRecorderRef.current?.start(1000);

      // Purely cosmetic: the displayed time is RECOMPUTED from timestamps, so
      // even if this tick is throttled to once a minute the clock stays right.
      timerRef.current = setInterval(() => {
        setElapsed(
          Math.floor(
            (Date.now() - recordingStartedAtRef.current - pausedTotalMsRef.current) / 1000,
          ),
        );
      }, 1000);

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
      console.error('Error starting recording:', err);
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      isRecordingRef.current = true;

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

  const finalizeRecording = async () => {
    isRecordingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    stopKeepAliveRef.current?.();
    stopKeepAliveRef.current = null;
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    // Final stop: do NOT restart. The recorder's onstop collects the last
    // (complete) segment and resolves this promise via finalizeResolveRef.
    const stopped = new Promise<void>((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') {
        collectSegment();
        resolve();
        return;
      }
      shouldRestartRef.current = false;
      finalizeResolveRef.current = resolve;
      mr.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    });

    await stopped;
    stopVisualizer();
    await releaseWakeLock();
    setState('uploading');
    // Drain the serial upload chain, then make sure every queued upload settled.
    await uploadChainRef.current.catch(() => {});
    await Promise.allSettled(pendingUploadsRef.current);

    if (segmentCountRef.current === 0) {
      setError('No se capturó audio. Revisa que el micrófono tenga permiso y vuelve a grabar.');
      setState('idle');
      return;
    }

    if (failedSegmentsRef.current > 0) {
      setWarning(
        `${failedSegmentsRef.current} fragmento(s) de audio no se pudieron subir. La minuta puede quedar incompleta.`,
      );
    }

    setState('processing');
    setProcessingStep('transcribe');
    setProcessingMessage('Transcribiendo el audio…');

    const result = await runMeetingPipeline(meetingIdRef.current, (p) => {
      setProcessingStep(p.step);
      setProcessingMessage(
        p.segmentsTotal ? `${p.label} (${p.segmentsProcessed}/${p.segmentsTotal})` : p.label,
      );
    });

    if (!result.ok) {
      setError(result.error || 'No se pudo procesar la grabación.');
      setState('idle');
      setProcessingStep(null);
      return;
    }

    if (result.warning) setWarning(result.warning);
    setProcessingStep(null);
    setProcessingMessage('¡Listo!');
    onFinalized?.();
  };

  // Device capabilities depend on the user agent, so this can only run in the
  // browser (never during SSR).
  useEffect(() => {
    setBackground(backgroundRecordingSupport());
  }, []);

  useEffect(() => {
    if (state === 'recording' && streamRef.current && canvasRef.current) {
      setupVisualizer(streamRef.current);
    } else if (state === 'recording' && streamRef.current) {
      const raf = requestAnimationFrame(() => {
        if (streamRef.current && canvasRef.current) {
          setupVisualizer(streamRef.current);
        }
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [state, setupVisualizer]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close();
      if (timerRef.current) clearInterval(timerRef.current);
      stopKeepAliveRef.current?.();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [handleVisibilityChange]);

  return (
    <div className="flex flex-col items-center gap-8">
      {error && (
        <div className="w-full max-w-md bg-rose-100 dark:bg-rose-900/30 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 gradient-error rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77-.833.192 2.5 1.732 2.5z" />
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
            {(state === 'uploading' || state === 'finalizing' || state === 'processing') && (
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            )}
            <span className="text-4xl sm:text-5xl font-light text-slate-900 dark:text-slate-100 tracking-wider tabular-nums">
              {formatTime(elapsed)}
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {state === 'recording' && `${segmentCount} segmento${segmentCount !== 1 ? 's' : ''}`}
              {state === 'paused' && 'En pausa'}
              {state === 'uploading' && 'Guardando...'}
              {state === 'finalizing' && 'Procesando...'}
              {state === 'processing' && processingStep && STEP_LABELS[processingStep]}
            </p>
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
                  ? 'No bloquees la pantalla'
                  : 'Puedes bloquear la pantalla'}
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
            {!analyserRef.current && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
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

        {(state === 'uploading' || state === 'finalizing') && (
          <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-full gradient-primary text-white font-semibold flex flex-col items-center justify-center gap-3 shadow-xl">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <span>{state === 'uploading' ? 'Guardando...' : 'Procesando...'}</span>
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
                Puede tardar unos minutos. No cierres esta pantalla.
              </p>
            </div>
          </div>
        )}

        {state === 'finalizing' && (
          <div className="w-full max-w-sm space-y-2">
            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
              <span>Transcribiendo audio...</span>
              <span>~30s</span>
            </div>
            <div className="w-full glass rounded-full h-1.5 overflow-hidden">
              <div className="gradient-primary h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}