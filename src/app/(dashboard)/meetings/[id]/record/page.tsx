import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import RecordButton from '@/components/recorder/RecordButton';

export default async function RecordPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();

  const { data: meeting } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!meeting) notFound();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Grabar: {meeting.title}</h1>
      <RecordButton meetingId={meeting.id} />
    </div>
  );
}
