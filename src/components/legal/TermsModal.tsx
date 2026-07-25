'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  docType: 'terms_of_service' | 'privacy_policy' | 'cookie_policy';
  onAccept: () => void;
  onReject: () => void;
  required?: boolean;
}

export default function TermsModal({
  isOpen,
  docType,
  onAccept,
  onReject,
  required = false,
}: TermsModalProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchDocument = async () => {
      try {
        const res = await fetch(`/api/legal/documents?type=${docType}`);
        const doc = await res.json();
        setContent(doc.content);
      } catch (err) {
        console.error('Error fetching document:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [isOpen, docType]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isAtBottom =
      element.scrollHeight - element.scrollTop <= element.clientHeight + 10;
    setScrolledToBottom(isAtBottom);
  };

  const handleAccept = async () => {
    try {
      await fetch('/api/legal/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType, doc_version: '1.0' }),
      });
      onAccept();
    } catch (err) {
      console.error('Error recording consent:', err);
    }
  };

  if (!isOpen) return null;

  const docLabels: Record<string, string> = {
    terms_of_service: 'Términos de Servicio',
    privacy_policy: 'Política de Privacidad',
    cookie_policy: 'Política de Cookies',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {docLabels[docType]}
            </h2>
          </div>
          {!required && (
            <button
              onClick={onReject}
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto p-6 text-slate-700 dark:text-slate-300 text-sm"
          onScroll={handleScroll}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-6 space-y-4">
          {/* Scroll hint */}
          {!scrolledToBottom && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Debes leer y desplazarte hasta el final para aceptar</span>
            </div>
          )}

          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={!scrolledToBottom}
              className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Acepto y entiendo los {docLabels[docType].toLowerCase()}
            </span>
          </label>

          {/* Buttons */}
          <div className="flex gap-3 justify-end">
            {!required && (
              <button
                onClick={onReject}
                className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors"
              >
                Rechazar
              </button>
            )}
            <button
              onClick={handleAccept}
              disabled={!agreed || loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Aceptar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
