'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Check {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  critical: boolean;
}

interface Report {
  ready: boolean;
  summary: string;
  checks: Check[];
  checkedAt: string;
}

const ICON = { ok: '✅', warn: '⚠️', error: '❌' } as const;

const ROW_STYLE = {
  ok: 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/60 dark:bg-emerald-900/15',
  warn: 'border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/15',
  error: 'border-rose-200 dark:border-rose-800/40 bg-rose-50/60 dark:bg-rose-900/15',
} as const;

/**
 * "¿Está todo bien?" in one screen.
 *
 * The failures that actually take ZRNote down are invisible from the app: a
 * revoked API key, a model the provider retired, a missing storage bucket.
 * This checks them live so nobody has to read logs or ask a developer.
 */
export default function DiagnosticoPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health/services', { cache: 'no-store' });
      if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
      setReport(await res.json());
    } catch (e: any) {
      setError(e?.message || 'No se pudo ejecutar el diagnóstico.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { run(); }, [run]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Diagnóstico</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Comprueba en vivo que todo lo que ZRNote necesita está funcionando.
        </p>
      </div>

      {loading && (
        <div className="glass-strong rounded-2xl p-8 text-center">
          <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-300 text-sm">Probando cada servicio…</p>
        </div>
      )}

      {error && !loading && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl p-5">
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {report && !loading && (
        <>
          <div
            className={`rounded-2xl p-5 border ${
              report.ready
                ? 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20'
            }`}
          >
            <p className={`text-lg font-semibold ${report.ready ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>
              {report.ready ? '✅ Listo para grabar' : '❌ Hay algo que impide grabar'}
            </p>
            <p className={`text-sm mt-0.5 ${report.ready ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
              {report.summary}
            </p>
          </div>

          <div className="space-y-2">
            {report.checks.map((check) => (
              <div key={check.id} className={`rounded-xl border p-4 ${ROW_STYLE[check.status]}`}>
                <div className="flex items-start gap-3">
                  <span className="text-base leading-none mt-0.5">{ICON[check.status]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-slate-900 dark:text-slate-100">
                      {check.label}
                      {check.critical && check.status === 'error' && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                          bloquea la app
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed break-words">
                      {check.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Comprobado {new Date(report.checkedAt).toLocaleString('es-ES')}
            </p>
            <button
              onClick={run}
              className="glass border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/80 dark:hover:bg-white/5 transition"
            >
              Volver a comprobar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
