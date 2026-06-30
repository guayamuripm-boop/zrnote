'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type RecordingState = 'idle' | 'recording' | 'paused' | 'uploading' | 'finalizing';

interface RecordButtonProps {
  meetingId: string;
  meetingTitle?: string;
  onFinalized?: () => void;
}

export default function RecordButton({ meetingId, meetingTitle, onFinalized }: RecordButtonProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUploadRef = useRef<Promise<void>>(Promise.resolve());
  const segmentCountRef = useRef(0);

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

    const response = await fetch(`/api/meetings/${meetingId}/upload-segment`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Upload failed');
    }
  };

  const handleDataAvailable = useCallback(
    (event: BlobEvent) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
        chunksRef.current = [];

        const currentSegment = segmentCountRef.current;
        segmentCountRef.current += 1;
        setSegmentCount((prev) => prev + 1);

        const uploadPromise = uploadSegment(blob, currentSegment).catch((err) => {
          console.error('Segment upload error:', err);
        });

        pendingUploadRef.current = uploadPromise;
      }
    },
    [meetingId]
  );

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      segmentCountRef.current = 0;
      setSegmentCount(0);
      setElapsed(0);
      setError(null);

      mediaRecorder.ondataavailable = handleDataAvailable;
      mediaRecorder.start(1000);

      setState('recording');

      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('No se pudo acceder al micrófono. Verifica los permisos.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      setState('paused');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
      setState('recording');
    }
  };

  const finalizeRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    }

    setState('uploading');
    await pendingUploadRef.current;

    setState('finalizing');
    try {
      const res = await fetch(`/api/meetings/${meetingId}/finalize`, { method: 'POST' });
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
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-8">
      {error && (
        <div className="w-full max-w-md bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div className="flex-1">
            <p className="text-red-800 text-sm font-medium">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Timer + Status */}
      {state !== 'idle' && (
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            {(state === 'recording' || state === 'paused') && (
              <span className={`w-3 h-3 rounded-full ${state === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-yellow-500'}`} />
            )}
            {(state === 'uploading' || state === 'finalizing') && (
              <svg className="w-5 h-5 text-zr-blue animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <span className="text-4xl font-mono font-light text-zr-navy tracking-wider">
              {formatTime(elapsed)}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {state === 'recording' && `${segmentCount} segmento${segmentCount !== 1 ? 's' : ''} capturado${segmentCount !== 1 ? 's' : ''}`}
            {state === 'paused' && 'Grabación en pausa'}
            {state === 'uploading' && 'Guardando último segmento...'}
            {state === 'finalizing' && 'Procesando audio y generando minuta...'}
          </p>
        </div>
      )}

      {/* Main Action Button */}
      <div className="relative">
        {state === 'idle' && (
          <button
            onClick={startRecording}
            className="group relative w-40 h-40 rounded-full bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold text-base transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 flex flex-col items-center justify-center gap-2"
          >
            <div className="absolute inset-0 rounded-full bg-red-400/30 animate-ping" style={{ animationDuration: '2s' }} />
            <svg className="w-12 h-12 relative z-10" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            <span className="relative z-10">Grabar</span>
          </button>
        )}

        {state === 'recording' && (
          <div className="flex items-center gap-6">
            <button
              onClick={pauseRecording}
              className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-white font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 flex flex-col items-center justify-center gap-1"
            >
              <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
              <span className="text-xs">Pausa</span>
            </button>
            <button
              onClick={finalizeRecording}
              className="w-36 h-36 rounded-full bg-gradient-to-br from-zr-navy to-zr-blue hover:from-zr-blue hover:to-zr-navy text-white font-semibold text-base transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 flex flex-col items-center justify-center gap-2"
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              <span>Finalizar</span>
            </button>
          </div>
        )}

        {state === 'paused' && (
          <div className="flex items-center gap-6">
            <button
              onClick={resumeRecording}
              className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 flex flex-col items-center justify-center gap-1"
            >
              <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span className="text-xs">Reanudar</span>
            </button>
            <button
              onClick={finalizeRecording}
              className="w-36 h-36 rounded-full bg-gradient-to-br from-zr-navy to-zr-blue hover:from-zr-blue hover:to-zr-navy text-white font-semibold text-base transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 flex flex-col items-center justify-center gap-2"
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              <span>Finalizar</span>
            </button>
          </div>
        )}

        {(state === 'uploading' || state === 'finalizing') && (
          <div className="w-40 h-40 rounded-full bg-gradient-to-br from-zr-blue to-blue-500 text-white font-semibold text-base flex flex-col items-center justify-center gap-3 shadow-xl">
            <svg className="w-10 h-10 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>{state === 'uploading' ? 'Guardando...' : 'Procesando...'}</span>
          </div>
        )}
      </div>

      {/* Progress hint */}
      {state === 'finalizing' && (
        <div className="w-full max-w-sm space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Transcribiendo audio...</span>
            <span>~30s</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div className="bg-zr-blue h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      )}
    </div>
  );
}
