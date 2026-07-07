'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteMeetingButton({ meetingId, className = '' }: { meetingId: string; className?: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('¿Eliminar esta reunión? Esta acción no se puede deshacer.')) return;

    setLoading(true);
    const res = await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' });
    if (res.ok) {
      router.refresh();
    } else {
      alert('Error al eliminar');
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className={`text-zr-blue-mid/30 hover:text-indigo-500 transition disabled:opacity-50 ${className}`}
    >
      {loading ? (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      )}
    </button>
  );
}
