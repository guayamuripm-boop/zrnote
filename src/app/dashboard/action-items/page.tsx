import { createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { PriorityBadge } from '@/components/PriorityBadge';
import ActionItemStatus from '@/components/ActionItemStatus';

export const dynamic = 'force-dynamic';

export default async function ActionItemsPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email || '';

  // Action items are assigned by the LLM by NAME/EMAIL, not by user_id, and RLS
  // only exposes rows where assignee_user_id = me. So we read with the service
  // client, strictly scoped to THIS user's id/email, to also catch email matches.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  const orFilter = [
    user?.id ? `assignee_user_id.eq.${user.id}` : null,
    email ? `assignee_email.ilike.${email}` : null,
  ].filter(Boolean).join(',');

  const { data: raw } = orFilter
    ? await admin
        .from('action_items')
        .select('id, description, priority, due_date, status, created_at, meetings!inner(id, title, created_at)')
        .or(orFilter)
        .limit(300)
    : { data: [] as any[] };

  // Pending/in-progress first, completed last; then by due date.
  const order: Record<string, number> = { pendiente: 0, en_progreso: 1, completado: 2 };
  const actionItems = (raw || []).sort((a: any, b: any) => {
    const s = (order[a.status] ?? 0) - (order[b.status] ?? 0);
    if (s !== 0) return s;
    return (a.due_date || '9999').localeCompare(b.due_date || '9999');
  });

  const pending = actionItems.filter((i: any) => i.status !== 'completado').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Mis Tareas</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
          {pending} pendiente{pending !== 1 ? 's' : ''} · {actionItems.length} en total
        </p>
      </div>

      {actionItems.length > 0 ? (
        <div className="space-y-3">
          {actionItems.map((item: any) => (
            <div
              key={item.id}
              className={`glass-strong rounded-2xl p-4 sm:p-5 transition ${item.status === 'completado' ? 'opacity-60' : ''}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`font-medium text-slate-900 dark:text-slate-100 ${item.status === 'completado' ? 'line-through' : ''}`}>
                    {item.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {item.meetings && (
                      <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                        {item.meetings.title}
                      </span>
                    )}
                    {item.due_date && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Vence {new Date(item.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <PriorityBadge priority={item.priority} />
                  <ActionItemStatus itemId={item.id} initialStatus={item.status} />
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
          <p className="text-slate-500 dark:text-slate-400 text-lg">No tienes tareas asignadas</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Aparecerán aquí cuando proceses una reunión.</p>
        </div>
      )}
    </div>
  );
}
