'use client';

import { useState } from 'react';
import { formatMinuteForCopy, type CopyMinute, type CopyActionItem } from '@/lib/minute-copy-format';

interface Props {
  title: string;
  createdAt?: string | null;
  coordination?: string | null;
  minute: CopyMinute;
  actionItems?: CopyActionItem[];
  participants?: { name: string; email: string }[];
}

/** Copies the complete acta as structured plain text — see minute-copy-format.ts. */
export default function CopyMinuteButton(props: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = formatMinuteForCopy({
      ...props,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be blocked (permissions, non-secure context, an old
      // WebView) — fall back to the one thing that always works.
      const textarea = document.createElement('textarea');
      textarea.value = text;
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1.5 rounded-lg"
      title="Copiar el acta completa como texto, con estructura y emojis"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copiado
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copiar
        </>
      )}
    </button>
  );
}
