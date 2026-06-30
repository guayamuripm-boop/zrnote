'use client';

import { useParams } from 'next/navigation';
import RecordButton from '@/components/recorder/RecordButton';

export default function RecordPage() {
  const params = useParams();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Grabar Reunión</h1>
      <RecordButton meetingId={params.id as string} />
    </div>
  );
}
