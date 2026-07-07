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
      className="gradient-warm text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-rose-500/25 transition-all duration-300 disabled:opacity-50 font-poppins inline-flex items-center gap-2"
    >
      {loading ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Reintentando...
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reintentar
        </>
      )}
    </button>
  );
}
