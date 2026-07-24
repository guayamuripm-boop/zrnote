'use client';

import { useState } from 'react';

type Status = 'pendiente' | 'en_progreso' | 'completado';

const NEXT: Record<Status, Status> = {
  pendiente: 'en_progreso',
  en_progreso: 'completado',
  completado: 'pendiente',
};

const LABEL: Record<Status, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  completado: 'Completado',
};

const STYLE: Record<Status, string> = {
  pendiente:
    'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700',
  en_progreso:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50',
  completado:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50',
};

export default function ActionItemStatus({
  itemId,
  initialStatus,
}: {
  itemId: string;
  initialStatus?: string | null;
}) {
  const [status, setStatus] = useState<Status>((initialStatus as Status) || 'pendiente');
  const [saving, setSaving] = useState(false);

  const cycle = async () => {
    if (saving) return;
    const next = NEXT[status];
    const prev = status;
    setStatus(next); // optimistic
    setSaving(true);
    try {
      const res = await fetch(`/api/action-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) setStatus(prev); // revert on failure
    } catch {
      setStatus(prev);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      onClick={cycle}
      disabled={saving}
      title="Toca para cambiar el estado"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition disabled:opacity-60 ${STYLE[status]}`}
    >
      {status === 'completado' ? (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : status === 'en_progreso' ? (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      )}
      {LABEL[status]}
    </button>
  );
}
