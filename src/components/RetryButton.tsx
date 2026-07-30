'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runMeetingPipeline } from '@/lib/pipeline-client';

export default function RetryButton({ meetingId }: { meetingId: string }) {
  const [loading, setLoading] = useState(false);
  const [stepMsg, setStepMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const router = useRouter();

  const handleRetry = async (attempt = 1): Promise<void> => {
    setLoading(true);
    setError(null);
    setWarning(null);

    // Reset the status via /finalize first.
    const finalizeRes = await fetch(`/api/meetings/${meetingId}/finalize`, { method: 'POST' });
    if (!finalizeRes.ok) {
      const data = await finalizeRes.json().catch(() => ({}));
      // The server's short "is this still genuinely in flight?" lock can be hit
      // right after an interruption. Wait it out instead of stranding the user.
      if (data.retryAfterSec && attempt < 3) {
        setStepMsg(`Reintentando en ${data.retryAfterSec}s…`);
        await new Promise((r) => setTimeout(r, (data.retryAfterSec + 1) * 1000));
        return handleRetry(attempt + 1);
      }
      setError(data.error || 'No se pudo reiniciar el procesamiento.');
      setLoading(false);
      return;
    }

    const result = await runMeetingPipeline(meetingId, (p) => setStepMsg(p.label));

    setLoading(false);
    if (!result.ok) setError(result.error || 'No se pudo completar el procesamiento.');
    else if (result.warning) setWarning(result.warning);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-left">
          <p className="text-xs text-rose-600 dark:text-rose-400 break-words">{error}</p>
        </div>
      )}
      {warning && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-left">
          <p className="text-xs text-amber-700 dark:text-amber-400 break-words">{warning}</p>
        </div>
      )}
      <button
        onClick={() => handleRetry()}
        disabled={loading}
        className="gradient-primary text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50 inline-flex items-center gap-2"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {stepMsg || 'Procesando…'}
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reintentar
          </>
        )}
      </button>
    </div>
  );
}
