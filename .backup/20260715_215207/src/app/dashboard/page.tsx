import { createServerSupabase } from '@/lib/supabase/server';
import Link from 'next/link';
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

  const meetings = meetingsResult.data || [];
  const actionItems = actionItemsResult.data || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Bienvenido, {user?.email}</p>
        </div>
        <Link
          href="/dashboard/meetings/new"
          className="gradient-primary text-white px-4 sm:px-5 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 hover:-translate-y-0.5 hidden sm:inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva Reunión
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-strong rounded-2xl p-4 sm:p-5 shadow-elevated">
          <div className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{meetings.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Reuniones</p>
        </div>
        <div className="glass-strong rounded-2xl p-4 sm:p-5 shadow-elevated">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{actionItems.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tareas pendientes</p>
        </div>
        <div className="glass-strong rounded-2xl p-4 sm:p-5 shadow-elevated">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{meetings.filter(m => m.status === 'completed').length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Completadas</p>
        </div>
        <div className="glass-strong rounded-2xl p-4 sm:p-5 shadow-elevated">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{meetings.filter(m => m.status === 'processing').length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Procesando</p>
        </div>
      </div>

      {/* Recent Meetings */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Reuniones Recientes</h2>
          <Link href="/dashboard/meetings" className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:text-slate-900 dark:hover:text-slate-100 transition">
            Ver todas
          </Link>
        </div>
        {meetings.length > 0 ? (
          <div className="space-y-3">
            {meetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/dashboard/meetings/${meeting.id}`}
                className="glass-strong block rounded-2xl p-4 sm:p-5 hover:shadow-elevated transition-all duration-300 hover:-translate-y-0.5 group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">{meeting.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      {meeting.coordination && `${meeting.coordination} · `}
                      {new Date(meeting.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <StatusBadge status={meeting.status} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="glass-strong rounded-2xl p-8 text-center">
            <div className="w-12 h-12 gradient-primary rounded-xl flex items-center justify-center mx-auto mb-3 opacity-50">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <p className="text-slate-500 dark:text-slate-400">No hay reuniones aún</p>
            <Link
              href="/dashboard/meetings/new"
              className="inline-flex items-center gap-2 mt-3 gradient-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:shadow-lg transition"
            >
              Crear primera reunión
            </Link>
          </div>
        )}
      </section>

      {/* Pending Tasks */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Mis Tareas Pendientes</h2>
          <Link href="/dashboard/action-items" className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:text-slate-900 dark:hover:text-slate-100 transition">
            Ver todas
          </Link>
        </div>
        {actionItems.length > 0 ? (
          <div className="space-y-3">
            {actionItems.map((item) => (
              <div key={item.id} className="glass-strong rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{item.description}</p>
                  <PriorityBadge priority={item.priority} />
                </div>
                {item.due_date && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Fecha límite: {new Date(item.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-strong rounded-2xl p-8 text-center">
            <p className="text-slate-500 dark:text-slate-400">No tienes tareas pendientes</p>
          </div>
        )}
      </section>
    </div>
  );
}