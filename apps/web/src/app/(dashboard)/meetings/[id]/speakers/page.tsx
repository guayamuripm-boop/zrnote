import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import SpeakerMapper from '@/components/minutes/SpeakerMapper';

export default async function SpeakersPage({
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

  const { data: participants } = await supabase
    .from('meeting_participants')
    .select('user_id, users(id, full_name)')
    .eq('meeting_id', params.id);

  const participantList = participants
    ?.map((p: any) => p.users)
    .filter(Boolean) ?? [];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Mapear Hablantes</h1>
      <SpeakerMapper
        meetingId={meeting.id}
        speakerMap={(meeting.speaker_map as Record<string, string>) || {}}
        participants={participantList}
      />
    </div>
  );
}
