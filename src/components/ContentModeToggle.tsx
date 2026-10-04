'use client';

import { useState } from 'react';

// Interruptor del modo Contenido: añade el estilo «Contenido» (podcasts,
// conferencias, videos) al selector de estilos al crear una reunión. Apagado
// por defecto para no llenar la pantalla de opciones que casi nadie usa.
export default function ContentModeToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !enabled;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentModeEnabled: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === 'string' ? body.error : 'No se pudo guardar');
      }
      setEnabled(next);
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        role="switch"
        aria-checked={enabled}
        className="flex items-center gap-3 w-full p-4 glass-strong rounded-2xl text-left transition hover:shadow-elevated disabled:opacity-50"
      >
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${
            enabled ? 'bg-gradient-to-br from-violet-500 to-indigo-500' : 'bg-slate-200 dark:bg-slate-700'
          }`}
        >
          🎙️
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-100">Modo contenido</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Podcasts, conferencias y videos: resumen por capítulos con la hora de cada tramo.
          </p>
        </div>
        <span
          className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${enabled ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600'}`}
          aria-hidden="true"
        >
          <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </span>
      </button>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
    </div>
  );
}
