'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type RecordingState = 'idle' | 'recording' | 'uploading_segment' | 'finalizing';

interface RecordButtonProps {
  meetingId: string;
  onFinalized?: () => void;
}

export default function RecordButton({ meetingId, onFinalized }: RecordButtonProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const segmentTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      console.warn('Wake Lock not supported');
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
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
      throw new Error('Upload failed');
    }
  };

  const saveSegmentToIndexedDB = async (blob: Blob, index: number) => {
    const db = await openDB();
    const tx = db.transaction('pending-segments', 'readwrite');
    tx.objectStore('pending-segments').put({
      meetingId,
      segmentIndex: index,
      blob,
      timestamp: Date.now(),
    });
  };

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('zrnote-offline', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('pending-segments', {
          keyPath: ['meetingId', 'segmentIndex'],
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const handleDataAvailable = useCallback(
    async (event: BlobEvent) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
        chunksRef.current = [];

        setState('uploading_segment');
        try {
          await uploadSegment(blob, segmentCount);
          setSegmentCount((prev) => prev + 1);
        } catch {
          await saveSegmentToIndexedDB(blob, segmentCount);
          setSegmentCount((prev) => prev + 1);
        }
        setState('recording');
      }
    },
    [segmentCount, meetingId]
  );

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = handleDataAvailable;
      mediaRecorder.start();

      setState('recording');
      await requestWakeLock();

      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);

      segmentTimerRef.current = setInterval(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.requestData();
        }
      }, 60 * 60 * 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }

    await releaseWakeLock();

    setState('finalizing');
    try {
      await fetch(`/api/meetings/${meetingId}/finalize`, { method: 'POST' });
      onFinalized?.();
    } catch (err) {
      console.error('Error finalizing:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
      releaseWakeLock();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={state === 'idle' ? startRecording : state === 'recording' ? stopRecording : undefined}
        disabled={state === 'uploading_segment' || state === 'finalizing'}
        className={`w-32 h-32 rounded-full flex items-center justify-center text-white font-bold text-lg transition ${
          state === 'recording'
            ? 'bg-red-600 pulse-recording'
            : state === 'idle'
            ? 'bg-gray-800 hover:bg-gray-700'
            : state === 'uploading_segment'
            ? 'bg-yellow-500'
            : 'bg-blue-600'
        }`}
      >
        {state === 'idle' && 'Iniciar Reunión'}
        {state === 'recording' && 'Grabando...'}
        {state === 'uploading_segment' && 'Guardando...'}
        {state === 'finalizing' && 'Procesando...'}
      </button>

      {state !== 'idle' && (
        <div className="text-center">
          <p className="text-2xl font-mono">{formatTime(elapsed)}</p>
          <p className="text-sm text-gray-500">Segmentos: {segmentCount}</p>
        </div>
      )}
    </div>
  );
}
