'use client';

import { useEffect, useState } from 'react';
import { offlineModelStatus, downloadOfflineModel, type OfflineModelStatus } from '@/lib/offline-transcribe';

/**
 * Lets the user download the on-device transcription model AHEAD OF TIME,
 * while there is a connection — it is the only way it can ever be useful:
 * offline is for USING it, not for fetching ~75MB the first time. See
 * offline-transcribe.ts for the honest trade-offs of what this produces.
 */
export default function OfflineModelCard() {
  const [status, setStatus] = useState<OfflineModelStatus | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void offlineModelStatus().then(setStatus);
  }, []);

  const download = async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('Necesitas conexión para descargar el modelo — es justo lo que te permite luego usarlo sin ella.');
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      await downloadOfflineModel((pct, l) => {
        setProgress(pct);
        setLabel(l);
      });
      setStatus(await offlineModelStatus());
    } catch (e: any) {
      setError(e?.message || 'No se pudo descargar el modelo.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none">📴</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Transcripción sin conexión (borrador)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Un modelo pequeño que corre en tu propio dispositivo, para cuando no hay señal en absoluto.
            Da un borrador aproximado — bastante peor que la transcripción real, sin la puntuación cuidada
            de siempre — pero mejor que esperar sin nada. En cuanto vuelva la conexión, la reunión se
            procesa igual con la transcripción de verdad, que sustituye a este borrador.
          </p>
        </div>
      </div>

      {status?.ready ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          ✅ Modelo descargado — listo para usarse sin conexión.
        </p>
      ) : downloading ? (
        <div className="space-y-1.5">
          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">{label} — {progress}%</p>
        </div>
      ) : (
        <button
          onClick={download}
          className="glass border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/80 dark:hover:bg-white/5 transition"
        >
          Descargar modelo (~{status?.approxSizeMb ?? 75} MB)
        </button>
      )}

      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}
