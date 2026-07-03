'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';

interface UploadedFile {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

export default function UploadAudioPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId = params.id as string;
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const audioFiles = Array.from(newFiles).filter((f) =>
      f.type.startsWith('audio/') || /\.(webm|mp3|m4a|ogg|wav|mpeg|mpg|3gp|aac)$/i.test(f.name)
    );
    setFiles((prev) => [
      ...prev,
      ...audioFiles.map((file) => ({ file, status: 'pending' as const })),
    ]);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);

    const updated = [...files];
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status !== 'pending') continue;

      updated[i] = { ...updated[i], status: 'uploading' };
      setFiles([...updated]);

      const formData = new FormData();
      formData.append('audio', updated[i].file);
      formData.append('segmentIndex', String(i));

      try {
        const res = await fetch(`/api/meetings/${meetingId}/upload-segment`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json();
          updated[i] = { ...updated[i], status: 'error', error: err.error };
        } else {
          updated[i] = { ...updated[i], status: 'done' };
        }
      } catch {
        updated[i] = { ...updated[i], status: 'error', error: 'Error de red' };
      }
      setFiles([...updated]);
    }

    setUploading(false);

    const allDone = updated.every((f) => f.status === 'done');
    if (allDone && updated.length > 0) {
      setProcessing(true);
      try {
        await fetch(`/api/meetings/${meetingId}/finalize`, { method: 'POST' });
        router.push(`/dashboard/meetings/${meetingId}`);
      } catch {
        setProcessing(false);
      }
    }
  };

  const doneCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Subir Audio</h1>
        <p className="text-gray-500 text-sm mt-1">
          Formatos soportados: MP3, M4A, WAV, OGG, WebM — Máximo 25MB por archivo
        </p>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-zr-blue hover:bg-blue-50/50 transition"
      >
        <svg className="w-10 h-10 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
        <p className="font-medium text-gray-600">Toca para seleccionar archivos</p>
        <p className="text-xs text-gray-400 mt-1">o arrastra archivos aquí</p>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.webm,.mp3,.m4a,.ogg,.wav,.aac,.mpeg,.mpg,.3gp"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-white border rounded-lg p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.file.name}</p>
                <p className="text-xs text-gray-400">
                  {(f.file.size / 1024 / 1024).toFixed(1)} MB
                  {f.status === 'error' && <span className="text-red-500 ml-2">{f.error}</span>}
                </p>
              </div>
              {f.status === 'uploading' && (
                <span className="text-xs text-blue-600 font-medium">Subiendo...</span>
              )}
              {f.status === 'done' && (
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {f.status === 'error' && (
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {f.status === 'pending' && (
                <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && !processing && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 text-center">
            {doneCount > 0 && `${doneCount} subido(s)`}
            {errorCount > 0 && ` · ${errorCount} error(es)`}
          </p>
          <button
            onClick={handleUpload}
            disabled={uploading || files.every((f) => f.status !== 'pending')}
            className="w-full bg-zr-blue text-white py-3 rounded-lg font-medium hover:bg-zr-navy transition disabled:opacity-50"
          >
            {uploading
              ? 'Subiendo...'
              : files.every((f) => f.status === 'done')
              ? 'Procesando...'
              : `Subir ${files.filter((f) => f.status === 'pending').length} archivo(s)`}
          </button>
          <button
            onClick={() => router.back()}
            className="w-full text-gray-500 py-2 text-sm hover:text-gray-700 transition"
          >
            Cancelar
          </button>
        </div>
      )}

      {processing && (
        <div className="text-center py-8">
          <div className="animate-spin w-8 h-8 border-4 border-zr-blue border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Procesando audio y generando minuta...</p>
          <p className="text-xs text-gray-400 mt-1">Esto puede tomar unos minutos</p>
        </div>
      )}
    </div>
  );
}
