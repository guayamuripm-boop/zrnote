'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import RecordButton from '@/components/recorder/RecordButton';

export default function RecordPage() {
  const params = useParams();
  const router = useRouter();
  const [meeting, setMeeting] = useState<{ title: string; status: string } | null>(null);

  useEffect(() => {
    fetch(`/api/meetings/${params.id}`)
      .then((res) => res.json())
      .then((data) => setMeeting(data))
      .catch(() => {});
  }, [params.id]);

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="text-center mb-8 sm:mb-12">
        <Link href={`/dashboard/meetings/${params.id}`} className="inline-flex items-center gap-1 text-sm text-zr-blue-mid/50 hover:text-zr-blue transition mb-6">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </Link>

        <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-sm font-medium mb-4">
          <span className={`w-2 h-2 rounded-full ${meeting?.status === 'processing' ? 'bg-indigo-400 animate-pulse' : 'bg-indigo-400'}`} />
          <span className="text-zr-blue-mid/70">
            {meeting?.status === 'processing' ? 'Procesando' : 'Listo para grabar'}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-zr-navy dark:text-zr-blue-pale">
          {meeting?.title || 'Grabar Reunión'}
        </h1>
        <p className="text-zr-blue-mid/50 text-sm mt-2 max-w-md mx-auto">
          Grabadora automática con transcripción y minuta inteligente.
          {meeting?.status === 'processing' && ' Tu audio está siendo procesado.'}
        </p>
      </div>

      {/* Recorder */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <RecordButton
          meetingId={params.id as string}
          meetingTitle={meeting?.title}
          onFinalized={() => router.push(`/dashboard/meetings/${params.id}`)}
        />
      </div>

      {/* Tips */}
      {meeting?.status !== 'processing' && (
        <div className="mt-8 sm:mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-2xl mx-auto">
          <div className="glass-strong rounded-2xl p-4 sm:p-5 text-center">
            <div className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-zr-navy dark:text-zr-blue-pale">Micrófono claro</p>
            <p className="text-xs text-zr-blue-mid/40 mt-1">Acerca el micrófono al hablante</p>
          </div>
          <div className="glass-strong rounded-2xl p-4 sm:p-5 text-center">
            <div className="w-10 h-10 gradient-success rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-zr-navy dark:text-zr-blue-pale">Pantalla bloqueada</p>
            <p className="text-xs text-zr-blue-mid/40 mt-1">Sigue grabando con la pantalla apagada</p>
          </div>
          <div className="glass-strong rounded-2xl p-4 sm:p-5 text-center">
            <div className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-zr-navy dark:text-zr-blue-pale">Minuta automática</p>
            <p className="text-xs text-zr-blue-mid/40 mt-1">Resumen y action items al instante</p>
          </div>
        </div>
      )}
    </div>
  );
}
