'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import RecordingConsentGate from '@/components/legal/RecordingConsentGate';
import { runMeetingPipeline, PipelineStep, STEP_LABELS } from '@/lib/pipeline-client';

const MIN_LENGTH = 40;

/**
 * "I already have a transcript" — Zoom's own export, Meet's captions, notes
 * someone typed by hand. Skips the audio pipeline entirely: the text is
 * attached directly to the meeting and the SAME analyze → e-mails steps that
 * read a recorded transcript read this one, because as far as that half of
 * the pipeline is concerned a transcript is a transcript regardless of where
 * it came from. See `transcribeMeeting()` in processing.ts for the one-line
 * change that makes "no audio, but a transcript already provided" mean
 * "already done" instead of an error.
 */
export default function PasteTranscriptPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;

  const [consentGiven, setConsentGiven] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [processingStep, setProcessingStep] = useState<PipelineStep | null>(null);
  const [processingMessage, setProcessingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const submit = async () => {
    if (text.trim().length < MIN_LENGTH) {
      setError(`Pega al menos ${MIN_LENGTH} caracteres de transcripción.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    setWarning(null);

    try {
      const res = await fetch(`/api/meetings/${meetingId}/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo guardar la transcripción');
      }

      setProcessingStep('analyze');
      setProcessingMessage('Redactando la minuta…');

      const result = await runMeetingPipeline(meetingId, (p) => {
        setProcessingStep(p.step);
        setProcessingMessage(p.label);
      });

      if (!result.ok) {
        setError(result.error || 'No se pudo generar la minuta.');
        setSubmitting(false);
        setProcessingStep(null);
        return;
      }
      if (result.warning) setWarning(result.warning);

      router.push(`/dashboard/meetings/${meetingId}`);
    } catch (e: any) {
      setError(e?.message || 'Error de conexión.');
      setSubmitting(false);
      setProcessingStep(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Ya tengo la transcripción</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Pega el texto — de Zoom, de Meet, de donde sea — y ZRNote lo lee, lo resume y saca los
          compromisos, exactamente igual que si hubiera transcrito el audio.
        </p>
      </div>

      <RecordingConsentGate meetingId={meetingId} mode="transcript" onConsent={() => setConsentGiven(true)} />

      {consentGiven && (
        <div className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated space-y-4">
          {!submitting ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Pega aquí la transcripción completa de la reunión…"
                rows={16}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3 text-sm text-slate-800 dark:text-slate-100 resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-xs text-slate-400 dark:text-slate-500">{text.trim().length} caracteres</p>

              {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

              <button
                onClick={submit}
                disabled={text.trim().length < MIN_LENGTH}
                className="gradient-primary text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-50"
              >
                Generar minuta
              </button>
            </>
          ) : (
            <div className="text-center space-y-3 py-4">
              <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {processingStep ? STEP_LABELS[processingStep] : processingMessage}
              </p>
              {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
              {warning && <p className="text-sm text-amber-600 dark:text-amber-400">{warning}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
