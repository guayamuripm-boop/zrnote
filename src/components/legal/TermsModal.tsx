'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { sanitizeHtml } from '@/lib/safe-html';

export const LEGAL_VERSION = '2.0';

interface TermsModalProps {
  isOpen: boolean;
  docType: 'terms_of_service' | 'privacy_policy' | 'cookie_policy' | 'recording_consent';
  /** Called after the acceptance has been recorded on the server. */
  onAccept: () => void;
  onReject: () => void;
  required?: boolean;
}

const DOC_LABELS: Record<string, string> = {
  terms_of_service: 'Condiciones de uso',
  privacy_policy: 'Aviso de privacidad',
  cookie_policy: 'Política de cookies',
  recording_consent: 'Consentimiento de grabación',
};

export default function TermsModal({
  isOpen,
  docType,
  onAccept,
  onReject,
  required = false,
}: TermsModalProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    fetch(`/api/legal/documents?type=${docType}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then((doc) => {
        if (cancelled) return;
        setContent(doc.content || '');
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
  }, [isOpen, docType]);

  // A short document never fires a scroll event, so the "you must scroll to the
  // end" guard used to disable the checkbox FOREVER — with `required`, that
  // locked the user out of the app entirely. Measure instead: if there is
  // nothing to scroll, it is already read.
  const checkRead = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 24;
    if (atBottom) setReadToEnd(true);
  }, []);

  useEffect(() => {
    if (loading) return;
    // Wait for layout so scrollHeight is meaningful.
    const raf = requestAnimationFrame(checkRead);
    return () => cancelAnimationFrame(raf);
  }, [loading, content, checkRead]);

  const handleAccept = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/legal/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType, doc_version: LEGAL_VERSION }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo registrar tu aceptación');
      }
      onAccept();
    } catch (e: any) {
      setSaveError(e?.message || 'No se pudo registrar tu aceptación. Revisa tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const label = DOC_LABELS[docType] || 'Documento';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{label}</h2>
          {!required && (
            <button
              onClick={onReject}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-2xl leading-none"
              aria-label="Cerrar"
            >
              ×
            </button>
          )}
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-5 sm:p-6"
          onScroll={checkRead}
        >
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : loadError ? (
            <div className="text-sm text-slate-600 dark:text-slate-300 space-y-3">
              <p className="font-medium text-rose-600 dark:text-rose-400">
                No se pudo cargar el documento.
              </p>
              <p>
                Puede que la base de datos aún no tenga los textos legales cargados (migración 020).
                Puedes continuar, pero revisa los documentos en{' '}
                <a href="/legal" target="_blank" className="text-blue-600 underline">/legal</a> en cuanto estén disponibles.
              </p>
            </div>
          ) : (
            <div className="legal-doc" dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 p-5 sm:p-6 space-y-3">
          {!readToEnd && !loading && !loadError && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
              Desplázate hasta el final para poder aceptar.
            </p>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={!readToEnd && !loadError}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              He leído y acepto {label.toLowerCase()}.
            </span>
          </label>

          {saveError && <p className="text-sm text-rose-600 dark:text-rose-400">{saveError}</p>}

          <div className="flex gap-3 justify-end">
            {!required && (
              <button
                onClick={onReject}
                className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors"
              >
                Ahora no
              </button>
            )}
            <button
              onClick={handleAccept}
              disabled={!agreed || loading || saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {saving ? 'Guardando…' : 'Aceptar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
