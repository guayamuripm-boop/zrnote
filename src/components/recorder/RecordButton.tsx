'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { maybeCompressAudio } from '@/lib/audio-compression';

type RecordingState = 'idle' | 'recording' | 'paused' | 'uploading' | 'finalizing' | 'processing';
type ProcessingStep = 'transcribe' | 'analyze' | 'vectorize' | 'emails';

interface RecordButtonProps {
  meetingId: string;
  meetingTitle?: string;
  onFinalized?: () => void;
}

const SEGMENT_DURATION_MS = 30 * 1000;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 120;

export default function RecordButton({ meetingId, meetingTitle, onFinalized }: RecordButtonProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [processingStep, setProcessingStep] = useState<ProcessingStep | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const segmentTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUploadsRef = useRef<Promise<void>[]>([]);
  const segmentCountRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const isRecordingRef = useRef(false);
  const meetingIdRef = useRef(meetingId);
  const pollAttemptsRef = useRef(0);
  const segmentStartTimeRef = useRef<number>(Date.now());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [failedSegments, setFailedSegments] = useState(0);
  const [speakerHint, setSpeakerHint] = useState<string>('');
  const [showSpeakerHintModal, setShowSpeakerHintModal] = useState(false);
  const [pendingSpeakerHintSegment, setPendingSpeakerHintSegment] = useState<number | null>(null);

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

  const uploadSegmentOnce = async (blob: Blob, index: number, speakerHint?: string, durationSec?: number) => {
    const blobToUpload = await maybeCompressAudio(blob, 2);
    
    const ext = getExt();
    
    const formData = new FormData();
    formData.append('audio', blobToUpload, `segment_${index}.${ext}`);
    formData.append('segmentIndex', index.toString());
    if (speakerHint) {
      formData.append('speakerHint', speakerHint);
    }
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

  const uploadSegment = async (blob: Blob, index: number, speakerHint?: string, durationSec?: number, maxAttempts = 3) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await uploadSegmentOnce(blob, index, speakerHint, durationSec);
        return;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  };

  const flushSegment = useCallback(async () => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
    chunksRef.current = [];

    const currentSegment = segmentCountRef.current;
    
    // Calculate actual duration of this segment in seconds
    const durationSec = Math.round((Date.now() - segmentStartTimeRef.current) / 1000);
    
    // Use confirmed speaker hint for this segment
    const hintToUse = speakerHint && pendingSpeakerHintSegment === currentSegment ? speakerHint : undefined;
    
    const uploadPromise = uploadSegment(blob, currentSegment, hintToUse, durationSec).catch((err) => {
      console.error(`Segment ${currentSegment} upload failed after retries:`, err);
      setFailedSegments((prev) => prev + 1);
    });

    // Clear hint after using it
    if (hintToUse) {
      setSpeakerHint('');
      setPendingSpeakerHintSegment(null);
    }

    // Reset segment start time for next segment
    segmentStartTimeRef.current = Date.now();
    segmentCountRef.current++;
    setSegmentCount(segmentCountRef.current);

    pendingUploadsRef.current.push(uploadPromise);
  }, [speakerHint, pendingSpeakerHintSegment]);

  const handleDataAvailable = useCallback((event: BlobEvent) => {
    if (event.data.size > 0) {
      chunksRef.current.push(event.data);
    }
  }, []);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        const wakeLock = await navigator.wakeLock.request('screen');
        wakeLockRef.current = wakeLock;
        setWakeLockActive(true);

        wakeLock.addEventListener('release', () => {
          setWakeLockActive(false);
        });
      }
    } catch (err) {
      console.log('Wake Lock not supported or denied:', err);
      setWakeLockActive(false);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  const setupMediaSession = () => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: meetingTitle || 'ZRNote Grabación',
        artist: 'ZRNote',
        album: 'Grabación en curso',
      });

      navigator.mediaSession.setActionHandler('pause', () => pauseRecording());
      navigator.mediaSession.setActionHandler('play', () => resumeRecording());
    }
  };

  const handleVisibilityChange = useCallback(async () => {
    if (document.visibilityState === 'hidden' && isRecordingRef.current) {
      console.log('Page hidden - flushing audio chunks');
      await flushSegment();
    } else if (document.visibilityState === 'visible' && isRecordingRef.current) {
      if (!wakeLockRef.current) {
        await requestWakeLock();
      }
    }
  }, [flushSegment]);

  const handleConfirmSpeakerHint = useCallback(() => {
    // The hint will be used in the next flushSegment call
    setShowSpeakerHintModal(false);
  }, []);

  const handleSkipSpeakerHint = useCallback(() => {
    setSpeakerHint('');
    setShowSpeakerHintModal(false);
    setPendingSpeakerHintSegment(null);
  }, []);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Detect best supported mimeType - FORCE audio/webm (sin codecs=opus) para compatibilidad móvil
      const mimeTypes = [
        'audio/webm',           // MÁS COMPATIBLE - sin codecs=opus
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

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,  // Bitrate fijo alto para evitar cambios de codec mid-stream
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      segmentCountRef.current = 0;
      pendingUploadsRef.current = [];
      setSegmentCount(0);
      setFailedSegments(0);
      setElapsed(0);
      setError(null);
      isRecordingRef.current = true;

      mediaRecorder.ondataavailable = handleDataAvailable;
      mediaRecorder.start(1000);

      segmentTimerRef.current = setInterval(() => {
        if (isRecordingRef.current) {
          flushSegment();
          // Show speaker hint modal for the next 30-min segment
          const nextSegmentIndex = segmentCountRef.current;
          setPendingSpeakerHintSegment(nextSegmentIndex);
          setShowSpeakerHintModal(true);
        }
      }, SEGMENT_DURATION_MS);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);

      setState('recording');

      await requestWakeLock();
      setupMediaSession();

      document.addEventListener('visibilitychange', handleVisibilityChange);

    } catch (err) {
      console.error('Error starting recording:', err);
      setError('No se pudo acceder al micrófono. Verifica los permisos.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      isRecordingRef.current = false;
      stopVisualizer();
      if (timerRef.current) clearInterval(timerRef.current);
      if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
      setState('paused');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      isRecordingRef.current = true;

      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);

      segmentTimerRef.current = setInterval(() => {
        if (isRecordingRef.current) {
          flushSegment();
          const nextSegmentIndex = segmentCountRef.current;
          setPendingSpeakerHintSegment(nextSegmentIndex);
          setShowSpeakerHintModal(true);
        }
      }, SEGMENT_DURATION_MS);

      setState('recording');
    }
  };

  const finalizeRecording = async () => {
    isRecordingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    }

    stopVisualizer();
    await releaseWakeLock();
    setState('uploading');
    await flushSegment();
    await Promise.all(pendingUploadsRef.current);

    if (failedSegments > 0) {
      setError(`${failedSegments} segmento(s) de audio no se pudieron subir. La minuta puede quedar incompleta.`);
    }

    // Start sequential processing via polling
    setState('processing');
    setProcessingStep('transcribe');
    setProcessingProgress(0);
    setProcessingMessage('Transcribiendo audio...');
    pollAttemptsRef.current = 0;

const processSteps: ProcessingStep[] = ['transcribe', 'analyze', 'vectorize', 'emails'];
  const stepMessages: Record<ProcessingStep, string> = {
    transcribe: 'Transcribiendo audio...',
    analyze: 'Generando minuta con IA...',
    vectorize: 'Indexando para búsqueda inteligente...',
    emails: 'Enviando correos...',
  };

    for (const step of processSteps) {
      setProcessingStep(step);
      setProcessingMessage(stepMessages[step]);
      setProcessingProgress(0);
      pollAttemptsRef.current = 0;

      const stepResult = await pollProcessingStep(meetingIdRef.current, step);
      
      if (!stepResult.ok) {
        setError(stepResult.error || `Error en paso: ${step}`);
        setState('idle');
        setProcessingStep(null);
        return;
      }
      
      // Update progress
      setProcessingProgress(100);
      await new Promise((r) => setTimeout(r, 500));
    }

    setProcessingStep(null);
    setProcessingMessage('¡Completado!');
    onFinalized?.();
  };

  const pollProcessingStep = async (meetingId: string, step: ProcessingStep): Promise<{ ok: boolean; error?: string }> => {
    while (pollAttemptsRef.current < MAX_POLL_ATTEMPTS) {
      pollAttemptsRef.current++;
      const progress = Math.min(90, (pollAttemptsRef.current / MAX_POLL_ATTEMPTS) * 90);
      setProcessingProgress(progress);

      try {
        const res = await fetch(`/api/meetings/${meetingId}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            // If more segments remain, keep polling
            if (data.more) {
              const segmentsMsg = data.segmentsTotal ? ` (${data.segmentsProcessed}/${data.segmentsTotal})` : '';
              setProcessingMessage(`Transcribiendo audio...${segmentsMsg}`);
              await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
              continue;
            }
            return { ok: true };
          }
          // If step not ready yet (e.g., analyze before transcribe), wait and retry
          if (data.error?.includes('Invalid status') || data.error?.includes('Run transcribe step first')) {
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            continue;
          }
          return { ok: false, error: data.error || `Step ${step} failed` };
        }

        const errData = await res.json().catch(() => ({}));
        return { ok: false, error: errData.error || `HTTP ${res.status}` };
      } catch (err) {
        return { ok: false, error: 'Error de conexión' };
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    return { ok: false, error: `Timeout en paso: ${step}` };
  };

  // Start/stop visualizer when recording state changes, after canvas mounts
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
      if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Error */}
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

      {/* Timer + Status */}
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
              {state === 'processing' && processingStep && (
                <>
                  {processingStep === 'transcribe' && 'Transcribiendo...'}
                  {processingStep === 'analyze' && 'Generando minuta...'}
                  {processingStep === 'emails' && 'Enviando correos...'}
                </>
              )}
            </p>
            {state === 'recording' && wakeLockActive && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Pantalla bloqueada activa
              </p>
            )}
          </div>
        </div>
      )}

      {/* Audio Visualizer */}
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

      {/* Main Action Button */}
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
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{processingMessage}</p>
              <div className="w-full glass rounded-full h-2 overflow-hidden">
                <div 
                  className="gradient-primary h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${processingProgress}%` }} 
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Paso: {processingStep === 'transcribe' ? '1/3' : processingStep === 'analyze' ? '2/3' : '3/3'}</span>
                <span>Intento: {pollAttemptsRef.current}/{MAX_POLL_ATTEMPTS}</span>
              </div>
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

      {showSpeakerHintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="glass-strong rounded-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">¿Quién está hablando ahora?</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Segmento de 30 min #{pendingSpeakerHintSegment !== null ? pendingSpeakerHintSegment + 1 : '?'}. Ingresa el nombre del orador principal para mejorar la transcripción.
            </p>
            <input
              type="text"
              value={speakerHint}
              onChange={(e) => setSpeakerHint(e.target.value)}
              placeholder="Ej: Juan Pérez, Directora, Cliente..."
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-white/80 dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmSpeakerHint()}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSkipSpeakerHint}
                className="flex-1 glass border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 py-3 rounded-xl font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Saltar
              </button>
              <button
                onClick={handleConfirmSpeakerHint}
                disabled={!speakerHint.trim()}
                className="flex-1 gradient-primary text-white py-3 rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}