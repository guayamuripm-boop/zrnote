import { createServerSupabase } from '@/lib/supabase/server';
import Link from 'next/link';
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
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zr-navy dark:text-zr-blue-pale">Reuniones</h1>
          <p className="text-zr-blue-mid/50 text-sm mt-0.5">{meetings?.length || 0} reuniones</p>
        </div>
        <Link
          href="/dashboard/meetings/new"
          className="gradient-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-300 inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva
        </Link>
      </div>

      {meetings && meetings.length > 0 ? (
        <div className="space-y-3">
          {meetings.map((meeting) => (
            <Link
              key={meeting.id}
              href={`/dashboard/meetings/${meeting.id}`}
              className="glass-strong block rounded-2xl p-4 sm:p-5 hover:shadow-elevated transition-all duration-300 hover:-translate-y-0.5 group"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-zr-navy dark:text-zr-blue-pale truncate group-hover:text-zr-blue transition">{meeting.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {meeting.coordination && (
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{meeting.coordination}</span>
                    )}
                    <span className="text-xs text-zr-blue-mid/40">
                      {new Date(meeting.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-zr-blue-mid/30 hidden sm:inline">{meeting.type}</span>
                  <StatusBadge status={meeting.status} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass-strong rounded-2xl p-12 text-center">
          <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4 opacity-50">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <p className="text-zr-blue-mid/50 text-lg">No hay reuniones</p>
          <p className="text-zr-blue-mid/30 text-sm mt-1">Crea una para empezar</p>
        </div>
      )}
    </div>
  );
}
