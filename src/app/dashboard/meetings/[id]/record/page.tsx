'use client';

import { useParams, useRouter } from 'next/navigation';
import RecordButton from '@/components/recorder/RecordButton';

export default function RecordPage() {
  const params = useParams();
  const router = useRouter();

  return (
    <div className="max-w-lg mx-auto space-y-8 text-center">
      <div>
        <h1 className="text-2xl font-bold text-zr-navy font-raleway">Grabar Reunión</h1>
        <p className="text-zr-blue-mid text-sm mt-2">
          Presiona <strong>Grabar</strong> para comenzar. Puedes pausar y reanudar cuando quieras.
        </p>
      </div>

      <RecordButton
        meetingId={params.id as string}
        onFinalized={() => router.push(`/dashboard/meetings/${params.id}`)}
      />

      <p className="text-xs text-gray-400 mt-4">
        El audio se guarda automáticamente cada segmento. Al finalizar, el sistema transcribirá y generará la minuta.
      </p>
    </div>
  );
}
