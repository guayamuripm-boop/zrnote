'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAudioConverter } from '@/lib/audio-conversion';
import { createClient } from '@/lib/supabase/client';
import { splitAdtsAac } from '@/lib/audio-split';
import { decodeToMono, chunkFloatToWav } from '@/lib/audio-wav';

interface UploadedFile {
  _id: string;
  file: File;
  originalFile: File;
  status: 'preparing' | 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  durationSec?: number;
  note?: string; // e.g. "parte 2/4", "convertido"
}

// Groq Whisper accepts up to 25MB per file. We keep every chunk under 24MB and
// upload it straight to Supabase Storage (signed URL), bypassing Vercel's 4.5MB
// request-body cap.
const WHISPER_MAX = 24 * 1024 * 1024;

// `/api/meetings/[id]/process` runs with a 60s server function limit. A cap on
// BYTES alone (WHISPER_MAX) is not enough: a low-bitrate voice recording can
// pack 20-40+ minutes into well under 24MB, and transcribing that much audio
// in a single Whisper call risks blowing the 60s window (504 Gateway Timeout).
// So every chunk is also capped by real DURATION, computed from the actual
// sample rate — never guessed from file size or assumed bitrate.
const TARGET_CHUNK_SEC = 180; // ~3 min: few round-trips, safely fast per call

// Cheap, non-blocking duration probe via the <audio> element's metadata —
// works for containers with duration info (mp4/m4a/mp3/wav/ogg) WITHOUT a
// full decode. Returns null if it can't tell (e.g. raw ADTS aac has no
// container duration — that case is handled by parsing ADTS frames instead).
function probeDurationSec(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const done = (v: number | null) => { URL.revokeObjectURL(url); resolve(v); };
    const timer = setTimeout(() => done(null), 4000);
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(audio.duration) ? audio.duration : null);
    };
    audio.onerror = () => { clearTimeout(timer); done(null); };
    audio.src = url;
  });
}

let idCounter = 0;
const nextId = () => `f${Date.now()}_${idCounter++}`;

export default function UploadAudioPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId = params.id as string;
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // FFmpeg.wasm — only used as a last-resort transcoder for exotic formats.
  const { convert, progress: convertProgress } = useAudioConverter();

  /**
   * Turn one input file into a list of upload-ready chunks, using the cheapest
   * strategy that works. The decision to split is ALWAYS based on real audio
   * DURATION (never file size alone) — see TARGET_CHUNK_SEC above for why.
   */
  const prepareChunks = useCallback(
    async (file: File): Promise<{ file: File; durationSec: number; note?: string }[]> => {
      const base = file.name.replace(/\.[^.]+$/, '');

      // Path A — raw ADTS AAC (phone recorders, the format Chrome can't decode).
      // Parse frame-by-frame (cheap, synchronous, no decode) to get the exact
      // duration from the real sample rate, then decide whether to split.
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const wholeParse = splitAdtsAac(bytes, { maxBytes: Infinity, maxDurationSec: Infinity });
        if (wholeParse) {
          const totalDurationSec = wholeParse.reduce((a, c) => a + c.durationSec, 0);
          if (totalDurationSec <= TARGET_CHUNK_SEC && file.size <= WHISPER_MAX) {
            return [{ file, durationSec: totalDurationSec }];
          }
          const adts = splitAdtsAac(bytes, { maxBytes: WHISPER_MAX, maxDurationSec: TARGET_CHUNK_SEC })!;
          return adts.map((c, i) => ({
            // Copy into a fresh ArrayBuffer-backed view — File wants a BufferSource,
            // and this also lets the original file's buffer be garbage-collected.
            file: new File([new Uint8Array(c.bytes)], `${base}_part${i + 1}.aac`, { type: 'audio/aac' }),
            durationSec: c.durationSec,
            note: `parte ${i + 1}/${adts.length}`,
          }));
        }
      } catch {
        /* fall through */
      }

      // Path B — decodable containers (m4a/mp3/wav/ogg/webm). Cheap metadata
      // probe first (no decode); only decode+re-encode if we must split.
      const probed = await probeDurationSec(file);
      if (probed !== null && probed <= TARGET_CHUNK_SEC && file.size <= WHISPER_MAX) {
        return [{ file, durationSec: probed }];
      }

      try {
        const { data, sampleRate } = await decodeToMono(file);
        const totalDurationSec = data.length / sampleRate;
        if (totalDurationSec <= TARGET_CHUNK_SEC && file.size <= WHISPER_MAX) {
          return [{ file, durationSec: totalDurationSec }];
        }
        // OfflineAudioContext renders faster than real time, so re-encoding to
        // duration-capped 16kHz mono WAV chunks here is effectively instant.
        const maxBytesForTarget = Math.min(WHISPER_MAX, TARGET_CHUNK_SEC * sampleRate * 2);
        const blobs = chunkFloatToWav(data, sampleRate, maxBytesForTarget);
        return blobs.map((b, i) => ({
          file: new File([b], `${base}_part${i + 1}.wav`, { type: 'audio/wav' }),
          durationSec: Math.min(TARGET_CHUNK_SEC, totalDurationSec - i * TARGET_CHUNK_SEC),
          note: blobs.length > 1 ? `parte ${i + 1}/${blobs.length}` : undefined,
        }));
      } catch {
        /* fall through */
      }

      // Path C — exotic/undecodable (amr, weird 3gp) that's also small enough
      // to upload as-is: no duration info available, but nothing else to do.
      if (file.size <= WHISPER_MAX) return [{ file, durationSec: 0 }];

      // Path D — too big AND undecodable: transcode to mp3 with FFmpeg.wasm,
      // then re-run this same logic on the (now decodable) result.
      const converted = await convert(file, { targetFormat: 'mp3', bitrateKbps: 64 });
      const chunks = await prepareChunks(converted.file);
      return chunks.map((c) => ({ ...c, note: c.note ? `${c.note} · convertido` : 'convertido' }));
    },
    [convert],
  );

  const addFiles = useCallback(
    async (newFiles: FileList | null) => {
      if (!newFiles) return;
      const audioFiles = Array.from(newFiles).filter(
        (f) => f.type.startsWith('audio/') || /\.(webm|mp3|m4a|ogg|oga|wav|mpeg|mpg|mp4|3gp|amr|aac)$/i.test(f.name),
      );

      for (const file of audioFiles) {
        const id = nextId();
        setFiles((prev) => [
          ...prev,
          { _id: id, file, originalFile: file, status: 'preparing', durationSec: 0 },
        ]);

        try {
          const chunks = await prepareChunks(file);
          setFiles((prev) => [
            ...prev.filter((f) => f._id !== id),
            ...chunks.map((c) => ({
              _id: nextId(),
              file: c.file,
              originalFile: file,
              status: 'pending' as const,
              durationSec: c.durationSec,
              note: c.note,
            })),
          ]);
        } catch (e: any) {
          setFiles((prev) =>
            prev.map((f) =>
              f._id === id
                ? {
                    ...f,
                    status: 'error',
                    error:
                      e?.message ||
                      'No se pudo procesar este audio. Convierte a MP3/M4A o usa "Grabar".',
                  }
                : f,
            ),
          );
        }
      }
    },
    [prepareChunks],
  );

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f._id !== id));

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);

    const supabase = createClient();
    const updated = [...files];

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status !== 'pending') continue;

      updated[i] = { ...updated[i], status: 'uploading' };
      setFiles([...updated]);

      try {
        const ext = (updated[i].file.name.split('.').pop() || 'aac').toLowerCase();

        // 1. Ask the server for a signed upload URL (tiny JSON request).
        const signRes = await fetch(`/api/meetings/${meetingId}/direct-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'sign', segmentIndex: i, ext, size: updated[i].file.size }),
        });
        const signData = await signRes.json().catch(() => ({}));
        if (!signRes.ok) throw new Error(signData.error || 'No se pudo firmar la subida');

        // 2. Upload the chunk straight to Storage (no Vercel size cap).
        const { error: upErr } = await supabase.storage
          .from('meeting-audio')
          .uploadToSignedUrl(signData.path, signData.token, updated[i].file, {
            contentType: updated[i].file.type || 'audio/aac',
          });
        if (upErr) throw new Error(upErr.message);

        // 3. Register the segment metadata.
        const regRes = await fetch(`/api/meetings/${meetingId}/direct-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phase: 'register',
            segmentIndex: i,
            path: signData.path,
            durationSec: Math.round(updated[i].durationSec || 0),
          }),
        });
        if (!regRes.ok) {
          const err = await regRes.json().catch(() => ({}));
          throw new Error(err.error || 'No se pudo registrar el segmento');
        }
        updated[i] = { ...updated[i], status: 'done' };
      } catch (e: any) {
        updated[i] = { ...updated[i], status: 'error', error: e?.message || 'Error subiendo archivo' };
      }
      setFiles([...updated]);
    }

    setUploading(false);

    const allDone = updated.every((f) => f.status === 'done');
    if (allDone && updated.length > 0) {
      setProcessing(true);
      setPipelineError(null);
      try {
        await fetch(`/api/meetings/${meetingId}/finalize`, { method: 'POST' });

        const processSteps = ['transcribe', 'analyze', 'vectorize', 'emails'];
        let failure: string | null = null;

        for (const step of processSteps) {
          let more = false;
          do {
            const res = await fetch(`/api/meetings/${meetingId}/process`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ step }),
            });
            const data = await res.json().catch(() => ({}));
            // A step that reports ok:false (or an HTTP error) is a real failure —
            // stop and surface it instead of marching on to a false "completado".
            if (!res.ok || data.ok === false) {
              const label =
                step === 'transcribe' ? 'transcribir el audio'
                : step === 'analyze' ? 'generar la minuta'
                : step === 'vectorize' ? 'indexar'
                : 'enviar los correos';
              failure = data.error ? `Error al ${label}: ${data.error}` : `Error al ${label}.`;
              break;
            }
            more = step === 'transcribe' ? data.more || false : false;
            if (more) await new Promise((r) => setTimeout(r, 1500));
          } while (more);

          // Emails failing should NOT block a successful minute — keep going.
          if (failure && step !== 'emails') break;
          if (failure && step === 'emails') failure = null;
        }

        if (failure) {
          setProcessing(false);
          setPipelineError(failure);
          return;
        }

        router.push(`/dashboard/meetings/${meetingId}`);
      } catch (e: any) {
        setProcessing(false);
        setPipelineError(e?.message || 'Error de conexión durante el procesamiento.');
      }
    }
  };

  const preparingCount = files.filter((f) => f.status === 'preparing').length;
  const doneCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const pendingCount = files.filter((f) => f.status === 'pending').length;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Link
          href={`/dashboard/meetings/${meetingId}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Subir Audio</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          MP3, M4A, WAV, OGG, WebM, AAC — hasta grabaciones de varias horas. Se prepara y sube
          automáticamente, incluso archivos pesados de tu teléfono.
        </p>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        className="glass-strong rounded-2xl p-8 sm:p-12 text-center cursor-pointer hover:shadow-elevated transition-all duration-300 border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 group"
      >
        <div className="w-14 h-14 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        <p className="font-semibold text-slate-900 dark:text-slate-100">Toca para seleccionar archivos</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">o arrastra archivos aquí</p>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.aac,.m4a,.mp3,.wav,.ogg,.oga,.webm,.3gp,.amr,.mp4"
          multiple
          onChange={(e) => addFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((f) => (
            <div key={f._id} className="glass rounded-xl p-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
                    />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{f.originalFile.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                    <span>{(f.file.size / 1024 / 1024).toFixed(1)} MB</span>
                    {f.note && (
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                        {f.note}
                      </span>
                    )}
                    {f.status === 'preparing' && <span className="text-amber-600 dark:text-amber-400">Preparando…</span>}
                    {f.status === 'error' && <span className="text-rose-600 dark:text-rose-400">{f.error}</span>}
                  </p>
                </div>
              </div>

              {f.status === 'preparing' && (
                <div
                  className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"
                  title="Preparando…"
                />
              )}
              {f.status === 'uploading' && (
                <div
                  className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"
                  title="Subiendo…"
                />
              )}
              {f.status === 'done' && (
                <div className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {(f.status === 'pending' || f.status === 'error') && (
                <button
                  onClick={() => removeFile(f._id)}
                  className="text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition"
                  title="Eliminar"
                >
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
            {convertProgress > 0 && convertProgress < 100 && ` · convirtiendo ${convertProgress}%`}
          </p>
          <button
            onClick={handleUpload}
            disabled={uploading || preparingCount > 0 || pendingCount === 0}
            className="w-full gradient-primary text-white py-3.5 rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50"
          >
            {uploading
              ? 'Subiendo…'
              : preparingCount > 0
                ? 'Preparando…'
                : `Subir ${pendingCount} archivo(s)`}
          </button>
          <button
            onClick={() => router.back()}
            className="w-full text-slate-400 dark:text-slate-500 py-2 text-sm hover:text-slate-900 dark:hover:text-slate-100 transition"
          >
            Cancelar
          </button>
        </div>
      )}

      {processing && (
        <div className="glass-strong rounded-2xl p-8 text-center">
          <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-medium text-slate-900 dark:text-slate-100">Procesando audio y generando minuta…</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Esto puede tomar unos minutos</p>
        </div>
      )}

      {pipelineError && !processing && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl p-5">
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300 mb-1">No se pudo completar el procesamiento</p>
          <p className="text-xs text-rose-600 dark:text-rose-400 break-words">{pipelineError}</p>
          <button
            onClick={() => router.push(`/dashboard/meetings/${meetingId}`)}
            className="mt-3 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Ver la reunión de todos modos →
          </button>
        </div>
      )}
    </div>
  );
}
