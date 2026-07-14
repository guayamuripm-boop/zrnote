'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface UploadedFile {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

// Must stay under Vercel's hard 4.5MB request body limit for Serverless Functions.
const MAX_FILE_SIZE = 4 * 1024 * 1024;

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
      ...audioFiles.map((file) => ({
        file,
        status: (file.size > MAX_FILE_SIZE ? 'error' : 'pending') as UploadedFile['status'],
        error: file.size > MAX_FILE_SIZE
          ? `Muy grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 4MB — usa "Grabar" para audios largos.`
          : undefined,
      })),
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
        const res = await fetch(`/api/meetings/${meetingId}/upload-segment`, { method: 'POST', body: formData });
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

        // Run pipeline steps sequentially (with batch loop for transcribe)
        const processSteps = ['transcribe', 'analyze', 'vectorize', 'emails'];
        for (const step of processSteps) {
          let more = false;
          do {
            const res = await fetch(`/api/meetings/${meetingId}/process`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ step }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              if (data.error?.includes('Invalid status') || data.error?.includes('Run')) break;
              break;
            }
            more = step === 'transcribe' ? (data.more || false) : false;
            await new Promise(r => setTimeout(r, 1000));
          } while (more);
        }

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
        <Link href={`/dashboard/meetings/${meetingId}`} className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Subir Audio</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Formatos: MP3, M4A, WAV, OGG, WebM — Máximo 4MB por archivo
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          ¿Audio más largo? Usa &quot;Grabar&quot; en vez de subir un archivo — graba y sube en vivo sin límite de tamaño.
        </p>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        className="glass-strong rounded-2xl p-8 sm:p-12 text-center cursor-pointer hover:shadow-elevated transition-all duration-300 border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 group"
      >
        <div className="w-14 h-14 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <p className="font-semibold text-slate-900 dark:text-slate-100">Toca para seleccionar archivos</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">o arrastra archivos aquí</p>
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
        <div className="glass-strong rounded-2xl p-4 sm:p-5 shadow-elevated space-y-3">
          {files.map((f, i) => (
            <div key={i} className="glass rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{f.file.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {(f.file.size / 1024 / 1024).toFixed(1)} MB
                  {f.status === 'error' && <span className="text-rose-600 dark:text-rose-400 ml-2">{f.error}</span>}
                </p>
              </div>
              {f.status === 'uploading' && (
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              )}
              {f.status === 'done' && (
                <div className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {f.status === 'error' && (
                <button onClick={() => removeFile(i)} className="w-6 h-6 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center hover:bg-rose-200 dark:hover:bg-rose-900/50 transition">
                  <svg className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {f.status === 'pending' && (
                <button onClick={() => removeFile(i)} className="text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition">
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
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
            {doneCount > 0 && `${doneCount} subido(s)`}
            {errorCount > 0 && ` · ${errorCount} error(es)`}
          </p>
          <button
            onClick={handleUpload}
            disabled={uploading || files.every((f) => f.status !== 'pending')}
            className="w-full gradient-primary text-white py-3.5 rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50"
          >
            {uploading ? 'Subiendo...' : files.every((f) => f.status === 'done') ? 'Procesando...' : `Subir ${files.filter((f) => f.status === 'pending').length} archivo(s)`}
          </button>
          <button onClick={() => router.back()} className="w-full text-slate-400 dark:text-slate-500 py-2 text-sm hover:text-slate-900 dark:hover:text-slate-100 transition">
            Cancelar
          </button>
        </div>
      )}

      {processing && (
        <div className="glass-strong rounded-2xl p-8 text-center">
          <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-medium text-slate-900 dark:text-slate-100">Procesando audio y generando minuta...</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Esto puede tomar unos minutos</p>
        </div>
      )}
    </div>
  );
}