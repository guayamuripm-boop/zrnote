'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';

// Used only on the meeting DETAIL page — after deleting, that URL no longer
// exists, so we must navigate away (router.refresh() would re-fetch the same
// dead URL and surface a 404). We route to the meetings list instead.
export default function DeleteMeetingButton({ meetingId, className = '' }: { meetingId: string; className?: string }) {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/dashboard/meetings');
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'No se pudo eliminar la reunión.');
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmOpen(true); }}
        className={`text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition ${className}`}
        title="Eliminar reunión"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      {error && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-rose-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-float max-w-sm text-center">
          {error}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="¿Eliminar esta reunión?"
        message="Se borrará la minuta, tareas, participantes y audio asociados. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
