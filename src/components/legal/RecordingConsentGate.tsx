'use client';

import { useEffect, useState } from 'react';
import { getPendingMeeting, confirmPendingConsent } from '@/lib/meeting-queue';
import Link from 'next/link';

interface Props {
  meetingId: string;
  mode: 'record' | 'upload' | 'transcript';
  /** Called once the user has confirmed (or had already confirmed) consent. */
  onConsent: () => void;
}

/**
 * Blocks recording/uploading until the organiser confirms that everyone in the
 * room knows they are being recorded and agreed to it.
 *
 * This is the single most important legal control in the product: in Venezuela,
 * Spain, Mexico, Colombia and much of the EU/US, capturing a private
 * conversation without the consent of all participants is a crime, not a
 * formality. ZRNote has no way to verify it, so the person pressing record
 * declares it and the declaration is stored with their user id and a timestamp.
 */
export default function RecordingConsentGate({ meetingId, mode, onConsent }: Props) {
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // A meeting created offline (see meeting-queue.ts) does not exist on the
      // server yet, so the network check below would either fail outright (no
      // connection) or 404 (connection came back, but this id is still purely
      // local). Its local record is the source of truth until it syncs.
      const pending = await getPendingMeeting(meetingId);
      if (cancelled) return;

      if (pending) {
        if (pending.consentAt) {
          setDone(true);
          onConsent();
        }
        setLoading(false);
        return;
      }

      fetch(`/api/meetings/${meetingId}/consent`)
        .then((r) => (r.ok ? r.json() : { consented: false }))
        .then((data) => {
          if (cancelled) return;
          if (data.consented) {
            setDone(true);
            onConsent();
          }
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
    })();

    return () => { cancelled = true; };
    // onConsent is a stable setter in practice; re-running on identity changes
    // would re-fire the gate on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      // Still a locally-pending meeting: record the declaration on the device,
      // with THIS moment's timestamp — the one that actually matters legally,
      // since it is before a single word gets recorded. It travels to the
      // server as `recording_consent_at` once meeting-queue.ts syncs the
      // meeting, not whenever that sync happens to succeed.
      const pending = await getPendingMeeting(meetingId);
      if (pending) {
        await confirmPendingConsent(meetingId);
        setDone(true);
        onConsent();
        return;
      }

      const res = await fetch(`/api/meetings/${meetingId}/consent`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo registrar la confirmación');
      }
      setDone(true);
      onConsent();
    } catch (e: any) {
      setError(e?.message || 'No se pudo registrar la confirmación.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || done) return null;

  // A pasted transcript is a fundamentally different situation from the other
  // two: ZRNote is not capturing anyone's voice, whatever recording produced
  // this text already happened, elsewhere, under whatever consent that tool
  // required. What ZRNote IS doing is sending this text to an outside AI
  // provider to read and structure — which is exactly the same
  // "you vouch for the data you bring" declaration the other two modes make,
  // just worded for text instead of audio, not a lighter version of it.
  const isTranscript = mode === 'transcript';
  const verb = mode === 'record' ? 'grabar' : mode === 'upload' ? 'subir este audio' : 'usar esta transcripción';

  return (
    <div className="w-full max-w-lg mx-auto bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700/50 rounded-2xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none">⚠️</span>
        <div className="min-w-0">
          <h2 className="font-semibold text-amber-900 dark:text-amber-200">
            Antes de {verb}: {isTranscript ? 'de quién son estas palabras' : 'consentimiento de los participantes'}
          </h2>
          <p className="text-sm text-amber-800 dark:text-amber-300/90 mt-1 leading-relaxed">
            {isTranscript ? (
              <>
                Esta transcripción sigue siendo lo que dijeron personas reales. ZRNote va a mandarla a un
                proveedor externo de inteligencia artificial para redactar la minuta, igual que con el audio
                — y quien tenga derecho a compartirla, y a haber avisado a esas personas de que se iba a
                usar así, eres tú.
              </>
            ) : (
              <>
                Avisa en voz alta que la reunión se va a grabar y espera a que <strong>todos</strong> estén
                de acuerdo. En Venezuela y en la mayoría de los países, grabar sin el consentimiento de
                todos los presentes es un <strong>delito</strong>, no un descuido.
              </>
            )}
          </p>
        </div>
      </div>

      {!isTranscript && (
        <div className="bg-white/70 dark:bg-slate-900/40 rounded-xl p-3.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Puedes decir literalmente esto:</p>
          <p className="text-sm text-slate-700 dark:text-slate-200 italic leading-relaxed">
            «Antes de empezar: voy a grabar esta reunión para generar la minuta automáticamente con una
            herramienta de inteligencia artificial. El audio se procesa en servidores externos y se
            borra a los 7 días. ¿Están todos de acuerdo?»
          </p>
        </div>
      )}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-amber-400 text-blue-600 shrink-0"
        />
        <span className="text-sm text-amber-900 dark:text-amber-200">
          {isTranscript
            ? 'Confirmo que tengo derecho a usar este texto, que informé a las personas mencionadas de que se procesaría con inteligencia artificial, y que no contiene datos sensibles de terceros sin base legal para tratarlos.'
            : 'Confirmo que informé a todos los participantes y que dieron su consentimiento para ser grabados y para que el audio se procese con inteligencia artificial.'}
        </span>
      </label>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          onClick={confirm}
          disabled={!checked || saving}
          className="gradient-primary text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? 'Guardando…' : `Confirmar y continuar`}
        </button>
        <Link
          href="/legal/consentimiento"
          target="_blank"
          className="text-xs text-amber-800 dark:text-amber-300 underline underline-offset-2"
        >
          Leer la guía completa de consentimiento
        </Link>
      </div>

      <p className="text-[11px] text-amber-700/80 dark:text-amber-400/70">
        Tu confirmación queda registrada con tu usuario y la fecha. ZRNote no puede verificarla: la
        responsabilidad legal de haber obtenido el consentimiento es de quien graba.
      </p>
    </div>
  );
}
