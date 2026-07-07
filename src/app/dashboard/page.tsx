import { createServerSupabase } from '@/lib/supabase/server';
import Link from 'next/link';
import DeleteMeetingButton from '@/components/DeleteMeetingButton';
import { StatusBadge } from '@/components/StatusBadge';
import { PriorityBadge } from '@/components/PriorityBadge';

export default async function DashboardHome() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const [meetingsResult, actionItemsResult] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, status, created_at, coordination')
      .eq('created_by', user?.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('action_items')
      .select('id, description, priority, due_date, status')
      .eq('assignee_user_id', user?.id)
      .eq('status', 'pendiente')
      .order('created_at', { ascending: false }),
  ]);

  const meetings = meetingsResult.data;
  const actionItems = actionItemsResult.data;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zr-navy font-raleway">Dashboard</h1>
          <p className="text-zr-blue-mid text-sm">Bienvenido, {user?.email}</p>
        </div>
        <Link
          href="/dashboard/meetings/new"
          className="bg-zr-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zr-navy transition font-raleway"
        >
          + Nueva Reunión
        </Link>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-zr-navy mb-4 font-raleway">Reuniones Recientes</h2>
        {meetings && meetings.length > 0 ? (
          <div className="bg-white rounded-lg border border-zr-blue-pale/30 divide-y divide-zr-blue-pale/20">
            {meetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/dashboard/meetings/${meeting.id}`}
                className="block p-4 hover:bg-zr-blue-pale/10 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-zr-navy">{meeting.title}</p>
                    <p className="text-sm text-zr-blue-mid">
                      {meeting.coordination && `${meeting.coordination} · `}
                      {new Date(meeting.created_at).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={meeting.status} />
                    <DeleteMeetingButton meetingId={meeting.id} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-zr-blue-pale/30 p-8 text-center">
            <p className="text-zr-blue-mid">No hay reuniones aún.</p>
            <Link
              href="/dashboard/meetings/new"
              className="inline-block mt-3 bg-zr-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zr-navy transition"
            >
              Crear primera reunión
            </Link>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zr-navy mb-4 font-raleway">Mis Tareas Pendientes</h2>
        {actionItems && actionItems.length > 0 ? (
          <div className="bg-white rounded-lg border border-zr-blue-pale/30 divide-y divide-zr-blue-pale/20">
            {actionItems.map((item) => (
              <div key={item.id} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-zr-navy">{item.description}</p>
                  <PriorityBadge priority={item.priority} />
                </div>
                {item.due_date && (
                  <p className="text-sm text-zr-blue-mid mt-1">
                    Fecha límite: {new Date(item.due_date).toLocaleDateString('es-ES')}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-zr-blue-pale/30 p-8 text-center">
            <p className="text-zr-blue-mid">No tienes tareas pendientes.</p>
          </div>
        )}
      </section>
    </div>
  );
}
