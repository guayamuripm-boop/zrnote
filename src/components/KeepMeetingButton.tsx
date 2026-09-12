'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface KeepMeetingButtonProps {
  meetingId: string;
  kept: boolean;
  className?: string;
}

/**
 * Toggles a meeting's exemption from the 30-day cleanup — see migration 029
 * and src/lib/meeting-lifecycle.ts. Every meeting that existed before that
 * migration was grandfathered as `kept = true`, so this control only matters
 * for meetings created afterwards.
 */
export default function KeepMeetingButton({ meetingId, kept, className = '' }: KeepMeetingButtonProps) {
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState(kept);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const toggle = async () => {
    setSaving(true);
    setError(null);
    const next = !current;
    try {
      const res = await fetch(`/api/meetings/${meetingId}/keep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kept: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar');
      setCurrent(next);
      router.refresh(); // clears the deletion countdown banner immediately
    } catch (e: any) {
      setError(e?.message || 'No se pudo actualizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={saving}
        title={
          current
            ? 'Esta reunión no se eliminará nunca por antigüedad'
            : 'Guárdala para que no se elimine a los 30 días'
        }
        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all inline-flex items-center gap-2 disabled:opacity-60 ${
          current
            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50'
            : 'glass border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-white/80 dark:hover:bg-white/5'
        } ${className}`}
      >
        <svg className="w-4 h-4" fill={current ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
        </svg>
        {current ? 'Guardada' : 'Guardar'}
      </button>
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}
