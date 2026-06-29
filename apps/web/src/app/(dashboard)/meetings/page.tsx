import { createServerSupabase } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function MeetingsPage() {
  const supabase = createServerSupabase();

  const { data: meetings } = await supabase
    .from('meetings')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reuniones</h1>
        <Link
          href="/dashboard/meetings/new"
          className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition"
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{meeting.title}</p>
                  <p className="text-sm text-gray-500">
                    {meeting.coordination && `${meeting.coordination} · `}
                    {new Date(meeting.created_at).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{meeting.type}</span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      meeting.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : meeting.status === 'processing'
                        ? 'bg-yellow-100 text-yellow-700'
                        : meeting.status === 'failed'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {meeting.status}
                  </span>
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
