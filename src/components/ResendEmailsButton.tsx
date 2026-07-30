'use client';

import { useState } from 'react';

/**
 * Re-send the minute by e-mail.
 *
 * Gmail SMTP fails often enough (app password expired, daily cap, a bad
 * address) that "the minute exists but nobody got it" is a normal state. Until
 * now the only way out was to reprocess the whole meeting.
 */
export default function ResendEmailsButton({ meetingId }: { meetingId: string }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/send-emails`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

      if (data.failed > 0) {
        setResult({
          kind: 'error',
          text: `${data.sent} enviado(s), ${data.failed} con error. ${data.error || ''}`.trim(),
        });
      } else {
        setResult({ kind: 'ok', text: `${data.sent} correo(s) enviado(s).` });
      }
    } catch (e: any) {
      setResult({ kind: 'error', text: e?.message || 'No se pudieron enviar los correos.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        onClick={send}
        disabled={sending}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1.5 rounded-lg disabled:opacity-50"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        {sending ? 'Enviando…' : 'Enviar correos'}
      </button>
      {result && (
        <span className={`text-[11px] max-w-[240px] text-right ${result.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {result.text}
        </span>
      )}
    </span>
  );
}
