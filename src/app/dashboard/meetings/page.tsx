import { createServerSupabase } from '@/lib/supabase/server';
import Link from 'next/link';
import DeleteMeetingButton from '@/components/DeleteMeetingButton';
import { StatusBadge } from '@/components/StatusBadge';

export default async function MeetingsPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, coordination, type, status, created_at')
    .eq('created_by', user?.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reuniones</h1>
        <Link
          href="/dashboard/meetings/new"
          className="bg-zr-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zr-navy transition"
        >
          + Nueva Reunión
        </Link>
      </div>

      {meetings && meetings.length > 0 ? (
        <div className="bg-white rounded-lg border divide-y">
          {meetings.map((meeting) => (
            <Link
              key={meeting.id}
              href={`/dashboard/meetings/${meeting.id}`}
              className="block p-4 hover:bg-gray-50 transition"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{meeting.title}</p>
                  <p className="text-sm text-gray-500">
                    {meeting.coordination && `${meeting.coordination} · `}
                    {new Date(meeting.created_at).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-500 hidden sm:inline">{meeting.type}</span>
                  <StatusBadge status={meeting.status} />
                  <DeleteMeetingButton meetingId={meeting.id} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-gray-500">No hay reuniones. Crea una para empezar.</p>
      )}
    </div>
  );
}
