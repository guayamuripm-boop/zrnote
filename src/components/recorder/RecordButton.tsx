'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type RecordingState = 'idle' | 'recording' | 'paused' | 'uploading_segment' | 'finalizing';

interface RecordButtonProps {
  meetingId: string;
  onFinalized?: () => void;
}

export default function RecordButton({ meetingId, onFinalized }: RecordButtonProps) {
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
      setError('No se pudo acceder al micrófono');
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

    setState('uploading_segment');
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
      setError('Error al finalizar');
      setState('idle');
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-6">
      {error && (
        <p className="text-red-600 text-sm text-center bg-red-50 px-4 py-2 rounded-lg">{error}</p>
      )}

      {state !== 'idle' && (
        <div className="text-center">
          <p className="text-3xl font-mono text-zr-navy">{formatTime(elapsed)}</p>
          <p className="text-sm text-gray-500 mt-1">
            {state === 'paused' ? 'En pausa' : 'Grabando'} · Segmentos: {segmentCount}
          </p>
        </div>
      )}

      {state === 'idle' && (
        <button
          onClick={startRecording}
          className="w-36 h-36 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-lg transition flex flex-col items-center justify-center gap-1 shadow-lg"
        >
          <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" />
          </svg>
          Grabar
        </button>
      )}

      {state === 'recording' && (
        <div className="flex items-center gap-4">
          <button
            onClick={pauseRecording}
            className="w-20 h-20 rounded-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold transition flex flex-col items-center justify-center gap-1 shadow-lg"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
            Pausa
          </button>
          <button
            onClick={finalizeRecording}
            className="w-36 h-36 rounded-full bg-zr-navy hover:bg-zr-blue text-white font-bold text-lg transition flex flex-col items-center justify-center gap-1 shadow-lg"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            Finalizar
          </button>
        </div>
      )}

      {state === 'paused' && (
        <div className="flex items-center gap-4">
          <button
            onClick={resumeRecording}
            className="w-20 h-20 rounded-full bg-green-600 hover:bg-green-700 text-white font-bold transition flex flex-col items-center justify-center gap-1 shadow-lg"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Reanudar
          </button>
          <button
            onClick={finalizeRecording}
            className="w-36 h-36 rounded-full bg-zr-navy hover:bg-zr-blue text-white font-bold text-lg transition flex flex-col items-center justify-center gap-1 shadow-lg"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            Finalizar
          </button>
        </div>
      )}

      {(state === 'uploading_segment' || state === 'finalizing') && (
        <div className="w-36 h-36 rounded-full bg-blue-600 text-white font-bold text-lg flex flex-col items-center justify-center gap-2 shadow-lg animate-pulse">
          <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {state === 'uploading_segment' ? 'Guardando...' : 'Procesando...'}
        </div>
      )}
    </div>
  );
}
