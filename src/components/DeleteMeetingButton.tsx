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
      className={`text-red-500 hover:text-red-700 text-xs font-medium transition disabled:opacity-50 ${className}`}
    >
      {loading ? '...' : 'Eliminar'}
    </button>
  );
}
