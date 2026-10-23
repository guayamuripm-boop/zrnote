'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import RecordButton from '@/components/recorder/RecordButton';
import RecordingConsentGate from '@/components/legal/RecordingConsentGate';
import OfflineDraftPanel from '@/components/OfflineDraftPanel';

/**
 * Pantalla de grabación: un «estudio» con el botón como protagonista.
 *
 * `preview` (sólo /dev/preview) salta la carga de la reunión y el
 * consentimiento para poder ver el grabador en reposo con datos de ejemplo.
 */
export default function RecordScreen({
  meetingId,
  preview,
}: {
  meetingId: string;
  preview?: { title: string; status: string };
}) {
  const router = useRouter();
  const [meeting, setMeeting] = useState<{ title: string; status: string } | null>(preview ?? null);
  const [consentGiven, setConsentGiven] = useState(Boolean(preview));

  useEffect(() => {
    if (preview) return;
    fetch(`/api/meetings/${meetingId}`)
      .then((res) => res.json())
      .then((data) => setMeeting(data))
      .catch(() => {});
  }, [meetingId, preview]);

  const processing = meeting?.status === 'processing';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/dashboard/meetings/${meetingId}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Volver a la reunión
        </Link>
        <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium bg-slate-900/5 dark:bg-white/10 text-slate-600 dark:text-slate-300">
          <span className={`w-2 h-2 rounded-full ${processing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
          {processing ? 'Procesando' : 'Listo para grabar'}
        </span>
      </div>

      {/* El escenario: un halo de luz detrás del botón, sin más ruido. */}
      <section className="relative overflow-hidden surface px-4 py-8 sm:px-10 sm:py-12">
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full bg-gradient-to-b from-blue-500/15 via-violet-500/10 to-transparent blur-3xl" />
        <div className="relative text-center mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-sora break-words">
            {meeting?.title || 'Grabar reunión'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 max-w-md mx-auto">
            {processing
              ? 'Tu audio se está procesando. La minuta llegará sola.'
              : 'Pulsa grabar y olvídate: al terminar, la minuta se genera sola y te avisamos.'}
          </p>
        </div>

        {/* Recorder — gated behind an explicit recording-consent confirmation */}
        <div className="relative flex flex-col items-center">
          {!preview && (
            <RecordingConsentGate meetingId={meetingId} mode="record" onConsent={() => setConsentGiven(true)} />
          )}
          {consentGiven && (
            <RecordButton
              meetingId={meetingId}
              meetingTitle={meeting?.title}
              onFinalized={() => router.push(`/dashboard/meetings/${meetingId}`)}
            />
          )}

          {/* Only ever shows itself when there is audio genuinely stuck on this
              device — reads the same durable store as RecordButton, writes to
              nothing it depends on. */}
          <div className="mt-6 flex justify-center w-full">
            <OfflineDraftPanel meetingId={meetingId} />
          </div>
        </div>
      </section>

      {/* Consejos y salida al plan B. El del medio es el honesto: si vas a
          bloquear el móvil (iOS corta la grabación al bloquear), mejor la
          grabadora del teléfono y subir el archivo aquí. */}
      {consentGiven && !processing && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="surface p-4 flex sm:flex-col items-start gap-3">
            <span className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Micrófono cerca</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Acércalo a quien habla: mejor audio, mejor minuta.</span>
            </span>
          </div>
          <Link
            href={`/dashboard/meetings/${meetingId}/upload`}
            className="group surface p-4 flex sm:flex-col items-start gap-3 hover:-translate-y-0.5 hover:shadow-lg transition-all"
          >
            <span className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                ¿Vas a bloquear el móvil?
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Graba con la grabadora del teléfono y sube el archivo aquí →</span>
            </span>
          </Link>
          <div className="surface p-4 flex sm:flex-col items-start gap-3">
            <span className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Minuta automática</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Resumen y compromisos, sin pulsar nada más.</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
