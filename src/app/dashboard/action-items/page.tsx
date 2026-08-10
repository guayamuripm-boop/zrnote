import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { PriorityBadge } from '@/components/PriorityBadge';
import ActionItemStatus from '@/components/ActionItemStatus';
import { getOwnMeetingIds, getUserActionItems } from '@/lib/action-items';

export const dynamic = 'force-dynamic';

export default async function ActionItemsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email || '';

  const ownMeetingIds = user?.id ? await getOwnMeetingIds(supabase, user.id) : [];
  const actionItems = user?.id ? await getUserActionItems(user.id, email, ownMeetingIds) : [];

  const pending = actionItems.filter((i) => i.status !== 'completado');
  const assignedToMe = pending.filter((i) => i.mine);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Compromisos</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
          {pending.length} pendiente{pending.length !== 1 ? 's' : ''}
          {assignedToMe.length > 0 && ` · ${assignedToMe.length} a tu nombre`}
          {' · '}{actionItems.length} en total
        </p>
      </div>

      {actionItems.length > 0 ? (
        <div className="space-y-3">
          {actionItems.map((item) => (
            <div
              key={item.id}
              className={`glass-strong rounded-2xl p-4 sm:p-5 transition ${item.status === 'completado' ? 'opacity-60' : ''} ${
                item.mine ? 'ring-1 ring-blue-200/60 dark:ring-blue-800/40' : ''
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`font-medium text-slate-900 dark:text-slate-100 ${item.status === 'completado' ? 'line-through' : ''}`}>
                    {item.kind === 'evento' && <span title="Evento: ocurre en un momento concreto" aria-hidden="true">📅 </span>}
                    {item.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {item.mine ? (
                      <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">
                        A tu nombre
                      </span>
                    ) : (
                      item.assignee_name && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Responsable: {item.assignee_name}
                        </span>
                      )
                    )}
                    {item.meetings && (
                      <Link
                        href={`/dashboard/meetings/${item.meetings.id}`}
                        className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 transition"
                      >
                        {item.meetings.title}
                      </Link>
                    )}
                    {item.due_date && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Vence {new Date(`${item.due_date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
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
          <p className="text-slate-500 dark:text-slate-400 text-lg">Todavía no hay compromisos</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
            Aparecerán aquí en cuanto proceses una reunión.
          </p>
        </div>
      )}
    </div>
  );
}
