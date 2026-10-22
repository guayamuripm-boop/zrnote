'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAudioConverter, segmentAudioNoReencode } from '@/lib/audio-conversion';
import { createClient } from '@/lib/supabase/client';
import { splitAdtsAac } from '@/lib/audio-split';
import { decodeToMono, chunkFloatToWav } from '@/lib/audio-wav';
import { runMeetingPipeline, type PipelineStep } from '@/lib/pipeline-client';
import { startBackgroundKeepAlive } from '@/lib/background-audio';
import RecordingConsentGate from '@/components/legal/RecordingConsentGate';
import { MAX_UPLOAD_ATTEMPTS, backoffMs, isPermanentHttpFailure } from '@/lib/retry-backoff';
import { readSharedAudio, clearSharedAudio } from '@/lib/share-stash';
import PushPrompt from '@/components/PushPrompt';

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
  const searchParams = useSearchParams();
  const meetingId = params.id as string;
  const inputRef = useRef<HTMLInputElement>(null);
  // Se puso a true tras haber ingerido el fichero del share-stash, para no
  // reintentarlo con cada re-render mientras el efecto sigue vivo.
  const sharedConsumedRef = useRef(false);
  // Mantiene viva la pestaña mientras se genera la minuta, para que el usuario
  // pueda cambiar de app o bloquear/desbloquear sin congelar el proceso a
  // medias. El servidor manda el push «minuta lista» al terminar, así que desde
  // que arranca el procesado el usuario es libre de irse.
  const keepAliveRef = useRef<null | (() => void)>(null);
  // La minuta arranca sola UNA vez; este ref evita que el efecto la dispare de
  // nuevo en cada render.
  const autoProcessedRef = useRef(false);

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [procProgress, setProcProgress] = useState<{ step: PipelineStep; done?: number; total?: number } | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [pipelineWarning, setPipelineWarning] = useState<string | null>(null);
  const [prepareNote, setPrepareNote] = useState<string | null>(null);
  const [convertPercent, setConvertPercent] = useState(0);
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

      // Path A — raw ADTS AAC (what phone voice recorders produce).
      //
      // Groq Whisper REJECTS raw .aac outright: its accepted list is
      // [flac mp3 mp4 mpeg mpga m4a ogg opus wav webm] and it checks the real
      // content, so renaming the file to .m4a does not fool it. This used to
      // upload the ADTS bytes verbatim, and every segment of every .aac meeting
      // came back `400 file must be one of the following types`.
      //
      // So ADTS is always re-muxed into a real MP4/M4A container. The frame
      // parser is still used, but only to measure the exact duration cheaply
      // (no decoding) so we know how to split.
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const wholeParse = splitAdtsAac(bytes, { maxBytes: Infinity, maxDurationSec: Infinity });
        if (wholeParse) {
          const totalDurationSec = wholeParse.reduce((a, c) => a + c.durationSec, 0);
          setPrepareNote(
            'Convirtiendo el audio a un formato compatible (la primera vez se descarga el conversor, ~30 MB)…',
          );
          const parts = await segmentAudioNoReencode(file, TARGET_CHUNK_SEC, {
            outputExt: 'm4a',
            onProgress: (p) => setConvertPercent(p),
          });
          setPrepareNote(null);
          setConvertPercent(0);
          return parts.map((f, i) => ({
            file: f,
            durationSec: Math.min(TARGET_CHUNK_SEC, Math.max(0, totalDurationSec - i * TARGET_CHUNK_SEC)),
            note: parts.length > 1 ? `parte ${i + 1}/${parts.length}` : 'convertido',
          }));
        }
      } catch (err) {
        setPrepareNote(null);
        setConvertPercent(0);
        // Not an ADTS stream, or the conversion failed — let the paths below try.
        console.warn('[ZRNote] Ruta AAC no aplicable:', err);
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
          const parts = await segmentAudioNoReencode(file, TARGET_CHUNK_SEC, {
            outputExt: 'm4a',
            onProgress: (p) => setConvertPercent(p),
          });
          setPrepareNote(null);
          setConvertPercent(0);
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

  // Ingesta del audio que llegó vía Web Share Target.
  //
  // El flujo: usuario en Notas de Voz → Compartir → ZRNote → el SW guarda el
  // fichero en un IndexedDB dedicado (share-stash) → /share-target crea la
  // reunión → nos empuja aquí con ?shared=1. Sólo queda leer el fichero,
  // meterlo en `addFiles` (mismo camino que si lo hubiera elegido a mano) y
  // limpiar el depósito para que un segundo intento pida un fichero nuevo.
  useEffect(() => {
    if (searchParams?.get('shared') !== '1') return;
    if (sharedConsumedRef.current) return;
    let cancelled = false;

    async function ingest() {
      const shared = await readSharedAudio();
      if (cancelled || !shared) return;
      sharedConsumedRef.current = true;

      // addFiles espera un FileList — se construye uno real con DataTransfer,
      // que es la única forma web-standard de crearlo desde código.
      const dt = new DataTransfer();
      dt.items.add(shared.file);
      await addFiles(dt.files);
      await clearSharedAudio();
    }

    void ingest();
    return () => {
      cancelled = true;
    };
  }, [searchParams, addFiles]);

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

      // Same retry policy as the recorder's own upload queue (retry-backoff.ts):
      // exponential backoff, and a genuine network error (not a real HTTP
      // response — the connection is simply down) parks the chunk instead of
      // spending one of its attempts. The file stays selected and held in
      // memory for the rest of THIS page session, so a dropped Wi-Fi signal or
      // a spotty connection now recovers on its own — one manual click used to
      // be required for every single chunk that hit a blip, on a file that can
      // be dozens of chunks long.
      let attempt = 0;
      let doneChunk = false;

      while (!doneChunk) {
        attempt++;

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setFiles((prev) =>
            prev.map((f) => (f._id === target._id ? { ...f, error: 'Sin conexión — reintentando…' } : f)),
          );
          await new Promise((r) => setTimeout(r, 5000));
          attempt--; // waiting for a connection back is not a failed attempt
          continue;
        }

        try {
          const ext = (target.file.name.split('.').pop() || 'aac').toLowerCase();

          // 1. Ask the server for a signed upload URL (tiny JSON request).
          const signRes = await fetch(`/api/meetings/${meetingId}/direct-upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phase: 'sign', segmentIndex, ext, size: target.file.size }),
          });
          const signData = await signRes.json().catch(() => ({}));
          if (!signRes.ok) {
            const err: any = new Error(signData.error || 'No se pudo firmar la subida');
            err.permanent = isPermanentHttpFailure(signRes.status);
            throw err;
          }

          // 2. Upload the chunk straight to Storage (no Vercel size cap).
          //
          // Store it as a generic binary. Storage used to keep `audio/aac`, and
          // that stored type travelled all the way into the multipart part sent
          // to Groq — which rejects `aac` outright, so every transcription came
          // back `400 file must be one of the following types`. The server now
          // sets the Content-Type explicitly per attempt, and keeping the stored
          // type neutral removes the trap entirely.
          const { error: upErr } = await supabase.storage
            .from('meeting-audio')
            .uploadToSignedUrl(signData.path, signData.token, target.file, {
              contentType: 'application/octet-stream',
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
            const e: any = new Error(err.error || 'No se pudo registrar el fragmento');
            e.permanent = isPermanentHttpFailure(regRes.status);
            throw e;
          }

          setFiles((prev) => prev.map((f) => (f._id === target._id ? { ...f, status: 'done' } : f)));
          doneChunk = true;
        } catch (e: any) {
          const message = e?.message || 'Error subiendo el archivo';

          if (e?.permanent || attempt >= MAX_UPLOAD_ATTEMPTS) {
            setFiles((prev) =>
              prev.map((f) => (f._id === target._id ? { ...f, status: 'error', error: message } : f)),
            );
            doneChunk = true; // out of attempts — move on to the next file
          } else {
            setFiles((prev) =>
              prev.map((f) =>
                f._id === target._id
                  ? { ...f, error: `${message} — reintentando (${attempt}/${MAX_UPLOAD_ATTEMPTS})` }
                  : f,
              ),
            );
            await new Promise((r) => setTimeout(r, backoffMs(attempt)));
          }
        }
      }
    }

    setUploading(false);
  };

  // Subida automática: en cuanto todos los fragmentos están preparados, se
  // suben sin pedir confirmación. El usuario ya confirmó al elegir el archivo.
  // Sólo se dispara por fragmentos 'pending': los que fallaron quedan a la
  // espera del reintento, así que un error no puede crear un bucle de subidas.
  useEffect(() => {
    if (!consentGiven || uploading || processing) return;
    const hasPending = files.some((f) => f.status === 'pending');
    const stillPreparing = files.some((f) => f.status === 'preparing');
    if (hasPending && !stillPreparing) void handleUpload();
    // handleUpload se recrea en cada render y lee `files` de este mismo render.
  }, [files, consentGiven, uploading, processing]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Kick off transcription → minute → e-mails for whatever is already uploaded. */
  const startProcessing = useCallback(async () => {
    setProcessing(true);
    setPipelineError(null);
    setPipelineWarning(null);
    setProcProgress({ step: 'transcribe' });

    // Trata la pestaña como «reproduciendo audio» para que el usuario pueda
    // cambiar de app o bloquear la pantalla sin que el navegador congele el
    // orquestador a mitad del pipeline. El push «minuta lista» lo manda el
    // servidor al terminar, así que desde aquí el usuario puede irse.
    keepAliveRef.current?.();
    keepAliveRef.current = startBackgroundKeepAlive({ title: 'Generando tu minuta' });

    const stopKeepAlive = () => {
      keepAliveRef.current?.();
      keepAliveRef.current = null;
    };

    try {
      await fetch(`/api/meetings/${meetingId}/finalize`, { method: 'POST' });

      const result = await runMeetingPipeline(meetingId, (p) => {
        setProcProgress({ step: p.step, done: p.segmentsProcessed, total: p.segmentsTotal });
      });

      stopKeepAlive();

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
      stopKeepAlive();
      setProcessing(false);
      setPipelineError(e?.message || 'Error de conexión durante el procesamiento.');
    }
  }, [meetingId, router]);

  // Minuta automática: en cuanto TODOS los fragmentos están subidos (y ninguno
  // se está preparando, subiendo o quedó en error), arranca el procesamiento
  // solo. Ya no hace falta pulsar «Generar la minuta». Si algo falló NO arranca:
  // el reintento queda en manos del usuario para no generar una minuta
  // incompleta en silencio.
  useEffect(() => {
    if (autoProcessedRef.current || processing || uploading) return;
    if (!consentGiven || files.length === 0) return;
    if (files.every((f) => f.status === 'done')) {
      autoProcessedRef.current = true;
      void startProcessing();
    }
  }, [files, consentGiven, uploading, processing, startProcessing]);

  // Suelta el keep-alive si el usuario abandona la página a mitad del proceso.
  useEffect(() => () => keepAliveRef.current?.(), []);

  const preparingCount = files.filter((f) => f.status === 'preparing').length;
  const doneCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const uploadingCount = files.filter((f) => f.status === 'uploading').length;

  // ── Una sola historia de progreso ─────────────────────────────────────────
  // Nada de «parte 1/4» ni lista de fragmentos: el usuario ve UNA barra que va
  // de «preparando» a «lista». Que el audio se parta en tramos es un detalle
  // interno que no aporta nada y sólo genera ruido y ansiedad.
  const totalChunks = files.length;
  const uploadFraction = totalChunks > 0 ? doneCount / totalChunks : 0;

  type FlowPhase = 'preparing' | 'uploading' | 'processing' | 'retry';
  let flowPhase: FlowPhase = 'uploading';
  if (processing) flowPhase = 'processing';
  else if (preparingCount > 0) flowPhase = 'preparing';
  else if (errorCount > 0 && uploadingCount === 0 && pendingCount === 0) flowPhase = 'retry';

  let flowPercent = 5;
  let flowHeadline = 'Preparando tu audio…';
  let flowSub = 'Un momento.';
  if (flowPhase === 'preparing') {
    const p = Math.max(convertPercent, convertProgress);
    flowPercent = 4 + (p > 0 ? (p / 100) * 6 : 2);
    flowHeadline = 'Preparando tu audio…';
    flowSub = prepareNote || 'Dejándolo listo para transcribir.';
  } else if (flowPhase === 'uploading') {
    flowPercent = 10 + uploadFraction * 55;
    flowHeadline = 'Subiendo el audio…';
    flowSub = 'Guardándolo a salvo.';
  } else if (flowPhase === 'processing') {
    const step = procProgress?.step ?? 'transcribe';
    const frac = procProgress?.total ? (procProgress.done ?? 0) / procProgress.total : 0;
    if (step === 'transcribe') {
      flowPercent = 70 + frac * 18;
      flowHeadline = 'Transcribiendo el audio…';
    } else if (step === 'analyze') {
      flowPercent = 90;
      flowHeadline = 'Redactando la minuta…';
    } else {
      flowPercent = 97;
      flowHeadline = 'Casi lista…';
    }
    flowSub = 'Puedes salir de esta pantalla: te avisamos cuando esté lista.';
  } else {
    flowPercent = 10 + uploadFraction * 55;
    flowHeadline = 'Algunos fragmentos no subieron';
    flowSub = 'Reintenta para completar la minuta.';
  }
  flowPercent = Math.min(99, Math.max(3, Math.round(flowPercent)));
  const flowSteps: { label: string; at: number }[] = [
    { label: 'Audio', at: 10 },
    { label: 'Transcripción', at: 70 },
    { label: 'Minuta', at: 90 },
  ];

  const showFlowCard = consentGiven && (files.length > 0 || processing);

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
          MP3, M4A, WAV, OGG, WebM, AAC — incluso grabaciones de varias horas. Se sube y
          se convierte en minuta solo; no tienes que hacer nada más.
        </p>
      </div>

      <RecordingConsentGate
        meetingId={meetingId}
        mode="upload"
        onConsent={() => setConsentGiven(true)}
      />

      {/* El selector de archivo sólo mientras no haya nada en marcha: en cuanto
          empieza el flujo, la pantalla es UNA sola tarjeta de progreso. */}
      {consentGiven && files.length === 0 && !processing && (
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
              <p className="font-semibold text-blue-600 dark:text-blue-400">Suelta el audio aquí</p>
              <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">La minuta se genera sola</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-900 dark:text-slate-100">Toca para elegir el audio</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">o arrástralo aquí</p>
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
      )}

      {/* La pantalla de trabajo: una tarjeta, una barra, una historia. */}
      {showFlowCard && (
        <div className="glass-strong rounded-2xl p-6 sm:p-8 shadow-elevated space-y-5">
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              {flowPhase === 'retry' ? (
                <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xl">
                  ⚠️
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 dark:text-slate-100">{flowHeadline}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{flowSub}</p>
            </div>
            {flowPhase !== 'retry' && (
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 tabular-nums shrink-0">
                {flowPercent}%
              </span>
            )}
          </div>

          {flowPhase !== 'retry' && (
            <>
              <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full gradient-primary transition-all duration-700 ease-out relative overflow-hidden"
                  style={{ width: `${flowPercent}%` }}
                >
                  <div className="absolute inset-0 bg-white/25 animate-pulse" />
                </div>
              </div>

              <div className="flex items-center justify-between">
                {flowSteps.map((s) => {
                  const reached = flowPercent >= s.at;
                  return (
                    <span
                      key={s.label}
                      className={`text-[11px] font-medium transition-colors ${
                        reached
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-300 dark:text-slate-600'
                      }`}
                    >
                      {reached ? '●' : '○'} {s.label}
                    </span>
                  );
                })}
              </div>
            </>
          )}

          {/* Pedir el permiso de notificación mientras hay tiempo, para que el
              aviso «minuta lista» pueda llegar aunque el usuario cambie de app. */}
          {(flowPhase === 'uploading' || flowPhase === 'processing') && <PushPrompt />}

          {flowPhase === 'retry' && (
            <div className="space-y-2">
              <button
                onClick={handleUpload}
                className="w-full gradient-primary text-white py-3 rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
              >
                Reintentar {errorCount} fragmento(s)
              </button>
              {doneCount > 0 && (
                <button
                  onClick={() => { autoProcessedRef.current = true; void startProcessing(); }}
                  className="w-full glass border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 py-3 rounded-xl text-sm font-medium hover:bg-white/80 dark:hover:bg-white/5 transition"
                >
                  Continuar con lo que ya subió
                </button>
              )}
            </div>
          )}

          {flowPhase !== 'processing' && (
            <button
              onClick={() => router.push(`/dashboard/meetings/${meetingId}`)}
              className="w-full text-slate-400 dark:text-slate-500 py-1 text-sm hover:text-slate-900 dark:hover:text-slate-100 transition"
            >
              Cancelar
            </button>
          )}
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
