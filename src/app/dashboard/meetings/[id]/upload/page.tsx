'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAudioConverter, segmentAudioNoReencode } from '@/lib/audio-conversion';
import { createClient } from '@/lib/supabase/client';
import { splitAdtsAac } from '@/lib/audio-split';
import { decodeToMono, chunkFloatToWav } from '@/lib/audio-wav';
import { runMeetingPipeline } from '@/lib/pipeline-client';
import RecordingConsentGate from '@/components/legal/RecordingConsentGate';

interface UploadedFile {
  _id: string;
  file: File;
  originalFile: File;
  status: 'preparing' | 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  durationSec?: number;
  note?: string; // e.g. "parte 2/4", "convertido"
  segmentIndex?: number;
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

// Above this, decoding the file in the browser is no longer safe: decodeAudioData
// materialises the WHOLE recording as raw PCM (a 2h 48kHz stereo file is ~2.7GB)
// and takes the tab down, especially on phones. Longer files are stream-copied
// with FFmpeg instead — no decoding, memory ≈ file size.
const MAX_DECODE_SEC = 15 * 60;

// Cheap, non-blocking duration probe via the <audio> element's metadata —
// works for containers with duration info (mp4/m4a/mp3/wav/ogg) WITHOUT a
// full decode. Returns null if it can't tell (e.g. raw ADTS aac has no
// container duration — that case is handled by parsing ADTS frames instead).
function probeDurationSec(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const done = (v: number | null) => { URL.revokeObjectURL(url); resolve(v); };
    const timer = setTimeout(() => done(null), 6000);
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
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
  const [processingStep, setProcessingStep] = useState('');
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [pipelineWarning, setPipelineWarning] = useState<string | null>(null);
  const [prepareNote, setPrepareNote] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);

  // FFmpeg.wasm — used to stream-copy long files and to transcode exotic ones.
  const { convert, progress: convertProgress } = useAudioConverter();

  /**
   * Turn one input file into a list of upload-ready chunks, using the cheapest
   * strategy that works. The decision to split is ALWAYS based on real audio
   * DURATION (never file size alone) — see TARGET_CHUNK_SEC above for why.
   */
  const prepareChunks = useCallback(
    async (file: File, depth = 0): Promise<{ file: File; durationSec: number; note?: string }[]> => {
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

      // Path B — anything with readable duration metadata. Short enough? Send as is.
      const probed = await probeDurationSec(file);
      if (probed !== null && probed <= TARGET_CHUNK_SEC && file.size <= WHISPER_MAX) {
        return [{ file, durationSec: probed }];
      }

      // Path C — LONG file: stream-copy into chunks with FFmpeg (no decoding,
      // no giant PCM buffer). This is the path that makes 1-3 hour recordings
      // from a phone actually work, including on the phone itself.
      if (probed !== null && probed > MAX_DECODE_SEC && depth === 0) {
        try {
          setPrepareNote('Preparando un audio largo (la primera vez se descarga el conversor, ~30 MB)…');
          const parts = await segmentAudioNoReencode(file, TARGET_CHUNK_SEC);
          setPrepareNote(null);
          return parts.map((f, i) => ({
            file: f,
            durationSec: Math.min(TARGET_CHUNK_SEC, probed - i * TARGET_CHUNK_SEC),
            note: `parte ${i + 1}/${parts.length}`,
          }));
        } catch {
          setPrepareNote(null);
          /* fall through to the decode path */
        }
      }

      // Path D — decodable containers of moderate length. OfflineAudioContext
      // renders faster than real time, so re-encoding to duration-capped 16kHz
      // mono WAV chunks here is effectively instant.
      try {
        const { data, sampleRate } = await decodeToMono(file);
        const totalDurationSec = data.length / sampleRate;
        if (totalDurationSec <= TARGET_CHUNK_SEC && file.size <= WHISPER_MAX) {
          return [{ file, durationSec: totalDurationSec }];
        }
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

      // Path E — exotic/undecodable but small enough to upload as-is.
      if (file.size <= WHISPER_MAX) return [{ file, durationSec: 0 }];

      // Path F — too big AND undecodable: transcode to mp3, then re-run.
      if (depth > 1) throw new Error('No se pudo preparar este audio. Conviértelo a MP3 o M4A e inténtalo de nuevo.');
      setPrepareNote('Convirtiendo un formato poco común (puede tardar)…');
      const converted = await convert(file, { targetFormat: 'mp3', bitrateKbps: 64 });
      setPrepareNote(null);
      const chunks = await prepareChunks(converted.file, depth + 1);
      return chunks.map((c) => ({ ...c, note: c.note ? `${c.note} · convertido` : 'convertido' }));
    },
    [convert],
  );

  const addFiles = useCallback(
    async (newFiles: FileList | null) => {
      if (!newFiles) return;
      const audioFiles = Array.from(newFiles).filter(
        (f) => f.type.startsWith('audio/') || f.type.startsWith('video/') ||
          /\.(webm|mp3|m4a|ogg|oga|wav|mpeg|mpg|mp4|3gp|amr|aac|flac|opus)$/i.test(f.name),
      );

      if (audioFiles.length === 0) {
        setPipelineError('Ese archivo no parece audio. Usa MP3, M4A, WAV, OGG, WebM o AAC.');
        return;
      }
      setPipelineError(null);

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
          setPrepareNote(null);
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

  /** Upload every pending/failed chunk. Safe to call again to retry the ones that failed. */
  const handleUpload = async () => {
    const toUpload = files.filter((f) => f.status === 'pending' || f.status === 'error');
    if (toUpload.length === 0) return;

    setUploading(true);
    setPipelineError(null);
    const supabase = createClient();

    // Ask the server where our numbering starts. Uploading a second batch into
    // the same meeting used to restart at 0 and overwrite the first batch.
    let baseIndex = 0;
    try {
      const beginRes = await fetch(`/api/meetings/${meetingId}/direct-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'begin' }),
      });
      const beginData = await beginRes.json().catch(() => ({}));
      if (!beginRes.ok) throw new Error(beginData.error || 'No se pudo iniciar la subida');
      baseIndex = Number(beginData.nextIndex) || 0;
    } catch (e: any) {
      setUploading(false);
      setPipelineError(e?.message || 'No se pudo iniciar la subida.');
      return;
    }

    let cursor = baseIndex;
    for (const target of toUpload) {
      // Reuse the index if this chunk already claimed one on a previous attempt.
      const segmentIndex = target.segmentIndex ?? cursor++;

      setFiles((prev) =>
        prev.map((f) => (f._id === target._id ? { ...f, status: 'uploading', segmentIndex, error: undefined } : f)),
      );

      try {
        const ext = (target.file.name.split('.').pop() || 'aac').toLowerCase();

        // 1. Ask the server for a signed upload URL (tiny JSON request).
        const signRes = await fetch(`/api/meetings/${meetingId}/direct-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'sign', segmentIndex, ext, size: target.file.size }),
        });
        const signData = await signRes.json().catch(() => ({}));
        if (!signRes.ok) throw new Error(signData.error || 'No se pudo firmar la subida');

        // 2. Upload the chunk straight to Storage (no Vercel size cap).
        const { error: upErr } = await supabase.storage
          .from('meeting-audio')
          .uploadToSignedUrl(signData.path, signData.token, target.file, {
            contentType: target.file.type || 'audio/aac',
          });
        if (upErr) throw new Error(upErr.message);

        // 3. Register the segment metadata.
        const regRes = await fetch(`/api/meetings/${meetingId}/direct-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phase: 'register',
            segmentIndex,
            path: signData.path,
            durationSec: Math.round(target.durationSec || 0),
          }),
        });
        if (!regRes.ok) {
          const err = await regRes.json().catch(() => ({}));
          throw new Error(err.error || 'No se pudo registrar el fragmento');
        }

        setFiles((prev) => prev.map((f) => (f._id === target._id ? { ...f, status: 'done' } : f)));
      } catch (e: any) {
        setFiles((prev) =>
          prev.map((f) =>
            f._id === target._id
              ? { ...f, status: 'error', error: e?.message || 'Error subiendo el archivo' }
              : f,
          ),
        );
      }
    }

    setUploading(false);
  };

  /** Kick off transcription → minute → e-mails for whatever is already uploaded. */
  const startProcessing = async () => {
    setProcessing(true);
    setPipelineError(null);
    setPipelineWarning(null);
    setProcessingStep('Preparando…');

    try {
      await fetch(`/api/meetings/${meetingId}/finalize`, { method: 'POST' });

      const result = await runMeetingPipeline(meetingId, (p) => {
        setProcessingStep(
          p.segmentsTotal ? `${p.label} (${p.segmentsProcessed}/${p.segmentsTotal})` : p.label,
        );
      });

      if (!result.ok) {
        setProcessing(false);
        setPipelineError(result.error || 'No se pudo completar el procesamiento.');
        return;
      }

      if (result.warning) {
        setProcessing(false);
        setPipelineWarning(result.warning);
        return;
      }

      router.push(`/dashboard/meetings/${meetingId}`);
    } catch (e: any) {
      setProcessing(false);
      setPipelineError(e?.message || 'Error de conexión durante el procesamiento.');
    }
  };

  const preparingCount = files.filter((f) => f.status === 'preparing').length;
  const doneCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const canUpload = (pendingCount > 0 || errorCount > 0) && preparingCount === 0 && !uploading;

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
          MP3, M4A, WAV, OGG, WebM, AAC — incluso grabaciones de varias horas. Se divide y
          sube automáticamente.
        </p>
      </div>

      <RecordingConsentGate
        meetingId={meetingId}
        mode="upload"
        onConsent={() => setConsentGiven(true)}
      />

      {consentGiven && (
        <>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`glass-strong rounded-2xl p-8 sm:p-12 text-center cursor-pointer hover:shadow-elevated transition-all duration-300 border-2 border-dashed group ${
              dragActive
                ? 'border-blue-500 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/20 scale-[1.02]'
                : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
            }`}
          >
            <div className={`w-14 h-14 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4 transition-transform ${dragActive ? 'scale-110' : 'group-hover:scale-110'}`}>
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            {dragActive ? (
              <>
                <p className="font-semibold text-blue-600 dark:text-blue-400">Suelta los archivos aquí</p>
                <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">Se procesarán automáticamente</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-900 dark:text-slate-100">Toca para seleccionar archivos</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">o arrastra archivos de audio aquí</p>
                <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-3">MP3, M4A, WAV, OGG, WebM, AAC, MP4, 3GP, AMR</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="audio/*,.aac,.m4a,.mp3,.wav,.ogg,.oga,.webm,.3gp,.amr,.mp4,.flac,.opus"
              multiple
              onChange={(e) => { addFiles(e.target.files); if (inputRef.current) inputRef.current.value = ''; }}
              className="hidden"
            />
          </div>

          {prepareNote && (
            <div className="glass rounded-xl p-4 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {prepareNote}
                {convertProgress > 0 && convertProgress < 100 && ` ${convertProgress}%`}
              </p>
            </div>
          )}
        </>
      )}

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
                <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" title="Preparando…" />
              )}
              {f.status === 'uploading' && (
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" title="Subiendo…" />
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
                  title="Quitar"
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
            {errorCount > 0 && ` · ${errorCount} con error`}
          </p>

          {canUpload && (
            <button
              onClick={handleUpload}
              className="w-full gradient-primary text-white py-3.5 rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
            >
              {errorCount > 0 && pendingCount === 0
                ? `Reintentar ${errorCount} archivo(s)`
                : `Subir ${pendingCount + errorCount} archivo(s)`}
            </button>
          )}

          {(uploading || preparingCount > 0) && (
            <button disabled className="w-full gradient-primary text-white py-3.5 rounded-xl font-medium opacity-50">
              {preparingCount > 0 ? 'Preparando…' : 'Subiendo…'}
            </button>
          )}

          {/* Partial success must not be a dead end: as long as SOMETHING got
              uploaded, let the user generate the minute with what there is. */}
          {doneCount > 0 && !uploading && preparingCount === 0 && (
            <button
              onClick={startProcessing}
              className={`w-full py-3.5 rounded-xl font-medium transition-all duration-300 ${
                errorCount > 0 || pendingCount > 0
                  ? 'glass border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-white/5'
                  : 'gradient-primary text-white hover:shadow-lg hover:shadow-blue-500/25'
              }`}
            >
              {errorCount > 0 || pendingCount > 0
                ? `Generar la minuta con los ${doneCount} archivo(s) subidos`
                : 'Generar la minuta'}
            </button>
          )}

          <button
            onClick={() => router.push(`/dashboard/meetings/${meetingId}`)}
            className="w-full text-slate-400 dark:text-slate-500 py-2 text-sm hover:text-slate-900 dark:hover:text-slate-100 transition"
          >
            Cancelar
          </button>
        </div>
      )}

      {processing && (
        <div className="glass-strong rounded-2xl p-8 text-center">
          <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-medium text-slate-900 dark:text-slate-100">{processingStep || 'Procesando…'}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Puede tardar unos minutos. No cierres esta pantalla.
          </p>
        </div>
      )}

      {pipelineWarning && !processing && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">La minuta está lista</p>
          <p className="text-xs text-amber-700 dark:text-amber-400 break-words">{pipelineWarning}</p>
          <button
            onClick={() => router.push(`/dashboard/meetings/${meetingId}`)}
            className="mt-3 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Ver la minuta →
          </button>
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
