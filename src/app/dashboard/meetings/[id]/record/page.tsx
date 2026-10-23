'use client';

import { useParams } from 'next/navigation';
import RecordScreen from '@/components/recorder/RecordScreen';

export default function RecordPage() {
  const params = useParams();
  return <RecordScreen meetingId={params.id as string} />;
}
