import { createServerSupabase } from '@/lib/supabase/server';
import { PriorityBadge } from '@/components/PriorityBadge';

export default async function ActionItemsPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: actionItems } = await supabase
    .from('action_items')
    .select('id, description, priority, due_date, status, meetings!inner(id, title, created_at)')
    .eq('assignee_user_id', user?.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Mis Tareas</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{actionItems?.length || 0} tareas asignadas</p>
      </div>

      {actionItems && actionItems.length > 0 ? (
        <div className="space-y-3">
          {actionItems.map((item: any) => (
            <div key={item.id} className="glass-strong rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{item.description}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {item.meetings && (
                      <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                        {item.meetings.title}
                      </span>
                    )}
                    {item.meetings?.created_at && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {new Date(item.meetings.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {item.due_date && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Fecha límite: {new Date(item.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <PriorityBadge priority={item.priority} />
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      item.status === 'completado'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : item.status === 'en_progreso'
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {item.status === 'completado' ? 'completado' : item.status === 'en_progreso' ? 'en progreso' : 'pendiente'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-strong rounded-2xl p-12 text-center">
          <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4 opacity-50">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-lg">No tienes tareas pendientes</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">¡Todo al día!</p>
        </div>
      )}
    </div>
  );
}