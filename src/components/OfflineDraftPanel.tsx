'use client';

import { useEffect, useState } from 'react';
import { pendingSegments } from '@/lib/recording-store';
import { transcribeOffline, offlineModelStatus } from '@/lib/offline-transcribe';

const DRAFT_KEY = (meetingId: string) => `zrnote-offline-draft:${meetingId}`;
/** Local storage is small; a runaway draft must not crowd out everything else the origin keeps there. */
const MAX_DRAFT_CHARS = 20_000;

/**
 * "Give me SOMETHING now, even rough" for a meeting whose audio is still
 * sitting on this device, unsent, because there is no connection.
 *
 * Deliberately separate from RecordButton rather than folded into it: that
 * component carries the actual recording, which this whole audit exists to
 * protect, and a bonus feature has no business adding surface area to it.
 * This reads the SAME durable segment store (never writes to it), so it
 * cannot interfere with the real upload once connectivity returns.
 */
export default function OfflineDraftPanel({ meetingId }: { meetingId: string }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([pendingSegments(meetingId), offlineModelStatus()]).then(([segs, model]) => {
      if (cancelled) return;
      setPendingCount(segs.length);
      setModelReady(model.ready);
    });
    try {
      const saved = localStorage.getItem(DRAFT_KEY(meetingId));
      if (saved) setDraft(saved);
    } catch {
      /* localStorage can be unavailable (private mode); the draft is a bonus, not a requirement */
    }
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  if (pendingCount === 0 && !draft) return null;
  if (!modelReady && !draft) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center max-w-sm">
        Hay {pendingCount} fragmento(s) de audio esperando conexión. Puedes descargar el modelo de
        transcripción local desde <a href="/dashboard/diagnostico" className="underline">Diagnóstico</a> para
        leer un borrador aproximado mientras tanto.
      </p>
    );
  }

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const segments = await pendingSegments(meetingId);
      const parts: string[] = [];
      for (let i = 0; i < segments.length; i++) {
        setProgress(`Transcribiendo fragmento ${i + 1} de ${segments.length}…`);
        const result = await transcribeOffline(segments[i].blob);
        if (result.text) parts.push(result.text);
      }
      const text = parts.join(' ').slice(0, MAX_DRAFT_CHARS);
      setDraft(text);
      try {
        localStorage.setItem(DRAFT_KEY(meetingId), text);
      } catch {
        /* best effort */
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudo generar el borrador.');
    } finally {
      setRunning(false);
      setProgress('');
    }
  };

  return (
    <div className="w-full max-w-md glass rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-base leading-none">📴</span>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Borrador aproximado generado en este dispositivo, sin conexión. Cuando la reunión se procese de
          verdad, la transcripción real lo sustituye — esto es solo para leer algo mientras tanto.
        </p>
      </div>

      {!draft && (
        <button
          onClick={run}
          disabled={running}
          className="w-full glass border border-slate-200 dark:border-slate-700 rounded-xl py-2 text-sm font-medium disabled:opacity-60"
        >
          {running ? progress || 'Generando…' : `Generar borrador de ${pendingCount} fragmento(s)`}
        </button>
      )}

      {draft && (
        <div className="bg-white/70 dark:bg-slate-900/40 rounded-xl p-3 max-h-48 overflow-y-auto">
          <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{draft || '(sin voz detectada)'}</p>
        </div>
      )}

      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}
