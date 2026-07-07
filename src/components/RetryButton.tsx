'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RetryButton({ meetingId }: { meetingId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRetry = async () => {
    setLoading(true);
    const res = await fetch(`/api/meetings/${meetingId}/finalize`, { method: 'POST' });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      alert('Error al reintentar: ' + (data.error || 'desconocido'));
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleRetry}
      disabled={loading}
      className="bg-red-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50"
    >
      {loading ? 'Reintentando...' : 'Reintentar Procesamiento'}
    </button>
  );
}