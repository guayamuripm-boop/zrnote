'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type RecordingState = 'idle' | 'recording' | 'paused' | 'uploading' | 'finalizing';

interface RecordButtonProps {
  meetingId: string;
  meetingTitle?: string;
  onFinalized?: () => void;
}

const SEGMENT_DURATION_MS = 30 * 60 * 1000;
const FLUSH_INTERVAL_MS = 30 * 1000;

export default function RecordButton({ meetingId, meetingTitle, onFinalized }: RecordButtonProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const segmentTimerRef = useRef<NodeJS.Timeout | null>(null);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUploadRef = useRef<Promise<void>>(Promise.resolve());
  const segmentCountRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const isRecordingRef = useRef(false);
  const meetingIdRef = useRef(meetingId);

  meetingIdRef.current = meetingId;

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const uploadSegment = async (blob: Blob, index: number) => {
    const formData = new FormData();
    formData.append('audio', blob, `segment_${index}.webm`);
    formData.append('segmentIndex', index.toString());

    const response = await fetch(`/api/meetings/${meetingIdRef.current}/upload-segment`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Upload failed');
    }
  };

  const flushSegment = useCallback(async () => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
    chunksRef.current = [];

    const currentSegment = segmentCountRef.current;
    segmentCountRef.current += 1;
    setSegmentCount((prev) => prev + 1);

    const uploadPromise = uploadSegment(blob, currentSegment).catch((err) => {
      console.error('Segment upload error:', err);
    });

    pendingUploadRef.current = uploadPromise;
  }, []);

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
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      segmentCountRef.current = 0;
      setSegmentCount(0);
      setElapsed(0);
      setError(null);
      isRecordingRef.current = true;

      mediaRecorder.ondataavailable = handleDataAvailable;
      mediaRecorder.start(1000);

      flushTimerRef.current = setInterval(() => {
        if (isRecordingRef.current && chunksRef.current.length > 0) {
          flushSegment();
        }
      }, FLUSH_INTERVAL_MS);

      segmentTimerRef.current = setInterval(() => {
        if (isRecordingRef.current) {
          flushSegment();
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
      if (timerRef.current) clearInterval(timerRef.current);
      if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
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

      flushTimerRef.current = setInterval(() => {
        if (isRecordingRef.current && chunksRef.current.length > 0) {
          flushSegment();
        }
      }, FLUSH_INTERVAL_MS);

      segmentTimerRef.current = setInterval(() => {
        if (isRecordingRef.current) {
          flushSegment();
        }
      }, SEGMENT_DURATION_MS);

      setState('recording');
    }
  };

  const finalizeRecording = async () => {
    isRecordingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    }

    await releaseWakeLock();
    setState('uploading');
    await flushSegment();
    await pendingUploadRef.current;

    setState('finalizing');
    try {
      const res = await fetch(`/api/meetings/${meetingIdRef.current}/finalize`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Error al finalizar');
        setState('idle');
        return;
      }
      onFinalized?.();
    } catch (err) {
      console.error('Error finalizing:', err);
      setError('Error de conexión al finalizar');
      setState('idle');
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
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
        <div className="w-full max-w-md glass-strong rounded-2xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-indigo-700 text-sm font-medium">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-indigo-400 hover:text-indigo-600 transition">
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
              <span className={`w-3 h-3 rounded-full ${state === 'recording' ? 'bg-indigo-500 animate-pulse' : 'bg-indigo-300'}`} />
            )}
            {(state === 'uploading' || state === 'finalizing') && (
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            )}
            <span className="text-4xl sm:text-5xl font-light text-zr-navy dark:text-zr-blue-pale tracking-wider tabular-nums">
              {formatTime(elapsed)}
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-zr-blue-mid/50">
              {state === 'recording' && `${segmentCount} segmento${segmentCount !== 1 ? 's' : ''}`}
              {state === 'paused' && 'En pausa'}
              {state === 'uploading' && 'Guardando...'}
              {state === 'finalizing' && 'Procesando...'}
            </p>
            {state === 'recording' && wakeLockActive && (
              <p className="text-xs text-indigo-500 flex items-center justify-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Pantalla bloqueada activa
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main Action Button */}
      <div className="relative">
        {state === 'idle' && (
          <button
            onClick={startRecording}
            className="group relative w-40 h-40 sm:w-48 sm:h-48 rounded-full gradient-primary hover:shadow-2xl hover:shadow-indigo-500/30 text-white font-semibold transition-all duration-300 hover:scale-105 flex flex-col items-center justify-center gap-2"
          >
            <div className="absolute inset-0 rounded-full bg-indigo-400/20 animate-ping" style={{ animationDuration: '2s' }} />
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
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 hover:from-indigo-500 hover:to-indigo-700 text-white font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 flex flex-col items-center justify-center gap-1"
            >
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
              <span className="text-[10px]">Pausa</span>
            </button>
            <button
              onClick={finalizeRecording}
              className="w-32 h-32 sm:w-36 sm:h-36 rounded-full gradient-primary hover:shadow-2xl hover:shadow-indigo-500/30 text-white font-semibold transition-all duration-300 hover:scale-105 flex flex-col items-center justify-center gap-2"
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
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full gradient-primary hover:shadow-lg hover:shadow-indigo-500/25 text-white font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 flex flex-col items-center justify-center gap-1"
            >
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span className="text-[10px]">Reanudar</span>
            </button>
            <button
              onClick={finalizeRecording}
              className="w-32 h-32 sm:w-36 sm:h-36 rounded-full gradient-primary hover:shadow-2xl hover:shadow-indigo-500/30 text-white font-semibold transition-all duration-300 hover:scale-105 flex flex-col items-center justify-center gap-2"
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
      </div>

      {/* Progress hint */}
      {state === 'finalizing' && (
        <div className="w-full max-w-sm space-y-2">
          <div className="flex justify-between text-xs text-zr-blue-mid/40">
            <span>Transcribiendo audio...</span>
            <span>~30s</span>
          </div>
          <div className="w-full glass rounded-full h-1.5 overflow-hidden">
            <div className="gradient-primary h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      )}
    </div>
  );
}
