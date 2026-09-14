'use client';

import { useState } from 'react';

/**
 * Enlace público de la minuta para compartir donde sea —Telegram, un correo
 * aparte, pegado en NotebookLM— sin depender de invitar a alguien por email.
 *
 * En móvil usa `navigator.share`: abre el selector nativo del sistema, que ya
 * incluye Telegram, WhatsApp y cualquier app instalada capaz de recibir un
 * enlace. Donde no existe (la mayoría de navegadores de escritorio), cae a
 * copiar el enlace al portapapeles — misma idea que CopyMinuteButton.
 */
export default function ShareLinkButton({ meetingId, title }: { meetingId: string; title: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const share = async () => {
    setState('loading');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/share-link`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState('error');
        setErrorMsg(data.error || 'No se pudo generar el enlace');
        setTimeout(() => setState('idle'), 3000);
        return;
      }
      const url: string = data.url;

      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title: `Minuta: ${title}`, url });
          setState('idle');
          return;
        } catch {
          // El usuario cerró el selector, o el navegador lo bloqueó: cae a
          // copiar, no lo tratamos como un fallo.
        }
      }

      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
        } catch {
          /* nothing more to try */
        }
        document.body.removeChild(textarea);
      }
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('error');
      setErrorMsg('Sin conexión');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  return (
    <button
      onClick={share}
      disabled={state === 'loading'}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-white bg-blue-100 dark:bg-blue-900/20 hover:bg-blue-500 dark:hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
      title="Genera un enlace público para compartir esta minuta donde quieras"
    >
      {state === 'copied' ? (
        <>
          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Enlace copiado
        </>
      ) : state === 'error' ? (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {errorMsg}
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342a3 3 0 100-2.684m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          {state === 'loading' ? 'Generando…' : 'Compartir'}
        </>
      )}
    </button>
  );
}
