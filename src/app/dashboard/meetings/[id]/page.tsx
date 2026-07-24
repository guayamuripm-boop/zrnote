import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import AssignActionItems from '@/components/minutes/AssignActionItems';
import DeleteMeetingButton from '@/components/DeleteMeetingButton';
import RetryButton from '@/components/RetryButton';
import { StatusBadge } from '@/components/StatusBadge';
import { PriorityBadge } from '@/components/PriorityBadge';
import ShareWhatsApp from '@/components/ShareWhatsApp';
import ActionItemStatus from '@/components/ActionItemStatus';

export default async function MeetingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, coordination, created_at, status, transcript_raw')
    .eq('id', params.id)
    .eq('created_by', user?.id)
    .single();

  if (!meeting) notFound();

  const [minuteResult, actionItemsResult, participantsResult] = await Promise.all([
    supabase.from('minutes').select('*').eq('meeting_id', params.id).single(),
    supabase.from('action_items').select('*').eq('meeting_id', params.id).order('priority', { ascending: true }),
    supabase.from('meeting_participants').select('*').eq('meeting_id', params.id),
  ]);

  const minute = minuteResult.data;
  const actionItems = actionItemsResult.data;
  const participantsRaw = participantsResult.data;

  const participants = (participantsRaw || []).map((p: any) => ({
    name: p.name || p.email_override?.split('@')[0] || 'Participante',
    email: p.email_override || '',
  })).filter((p) => p.email);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">{meeting.title}</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
              {meeting.coordination && `${meeting.coordination} · `}
              {new Date(meeting.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={meeting.status} />
            {meeting.status === 'scheduled' && (
              <div className="flex items-center gap-2">
                <Link
                  href={`/dashboard/meetings/${meeting.id}/record`}
                  className="gradient-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  </svg>
                  Grabar
                </Link>
                <Link
                  href={`/dashboard/meetings/${meeting.id}/upload`}
                  className="glass border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/80 dark:hover:bg-white/5 transition-all"
                >
                  Subir Audio
                </Link>
              </div>
            )}
            <DeleteMeetingButton meetingId={meeting.id} />
          </div>
        </div>
      </div>

      {/* Minute */}
      {minute && (
        <>
          <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
              <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              Minuta
              {meeting.status === 'completed' && (
                <span className="ml-auto flex items-center gap-2">
                  <ShareWhatsApp
                    title={meeting.title}
                    date={meeting.created_at}
                    minute={minute}
                    actionItems={(actionItems as any[]) || []}
                  />
                  <a
                    href={`/api/meetings/${params.id}/export-pdf`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1.5 rounded-lg"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    PDF
                  </a>
                </span>
              )}
            </h2>
            <div>
              <h3 className="font-medium text-sm text-slate-500 dark:text-slate-400 mb-1">Resumen</h3>
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{minute.summary}</p>
            </div>
          </section>

          {/* Action Items — the most important part of the minute, promoted right
              after the summary. Creator can toggle status here too (not just
              from "Mis Tareas"), matching the API's authorization. */}
          {actionItems && actionItems.length > 0 && (
            <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated ring-1 ring-blue-200/50 dark:ring-blue-800/30">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                Compromisos
                <span className="text-sm font-normal text-slate-400 dark:text-slate-500">({actionItems.length})</span>
              </h2>
              <div className="space-y-3">
                {actionItems.map((item) => (
                  <div key={item.id} className="glass rounded-xl p-4 hover:shadow-elevated transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-slate-900 dark:text-slate-100 ${item.status === 'completado' ? 'line-through opacity-60' : ''}`}>
                          {item.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {item.assignee_name || 'Sin asignar'}
                          </span>
                          {item.due_date && (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {new Date(item.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
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
            </section>
          )}

          {(!actionItems || actionItems.length === 0) && meeting.status === 'completed' && (
            <div className="glass-strong rounded-2xl p-6 text-center">
              <p className="text-slate-500 dark:text-slate-400 text-sm">No se generaron action items para esta reunión.</p>
              <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">El LLM no detectó compromisos específicos en la transcripción.</p>
            </div>
          )}

          {/* Assign Action Items - show whenever there are unassigned items and participants */}
          {actionItems && actionItems.length > 0 && participants.length > 0 && (
            <AssignActionItems meetingId={meeting.id} actionItems={actionItems} participants={participants} />
          )}

          {minute.decisions && (minute.decisions as string[]).length > 0 && (
            <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                <div className="w-8 h-8 gradient-success rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                Decisiones
              </h2>
              <ul className="space-y-2">
                {(minute.decisions as string[]).map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-200 text-sm">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {d}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {minute.blockers && (minute.blockers as any[]).length > 0 && (
            <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                Bloqueos
              </h2>
              <div className="space-y-3">
                {(minute.blockers as any[]).map((b, i) => (
                  <div key={i} className="bg-rose-50/80 border border-rose-100 dark:bg-rose-900/20 dark:border-rose-800/30 rounded-xl p-4">
                    <h3 className="font-semibold text-rose-800 dark:text-rose-300 text-sm">{b.issue}</h3>
                    <p className="text-sm text-rose-600 dark:text-rose-400 mt-0.5">Impacto: {b.impact}</p>
                    {b.owner && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Responsable: {b.owner}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Secondary detail — de-emphasized (lighter header, no big icon box)
              to cut visual noise, since these are background info, not action. */}
          {((minute.discussion && (minute.discussion as any[]).length > 0) ||
            (minute.project_statuses && (minute.project_statuses as any[]).length > 0) ||
            (minute.ideas && (minute.ideas as string[]).length > 0) ||
            (minute.next_steps && (minute.next_steps as string[]).length > 0)) && (
            <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated space-y-5">
              <h2 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                Más detalle
              </h2>

              {minute.project_statuses && (minute.project_statuses as any[]).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                    <span className="text-base">📊</span> Estado de proyectos
                  </h3>
                  <div className="space-y-2">
                    {(minute.project_statuses as any[]).map((p, i) => (
                      <div key={i} className="border-l-2 border-blue-300 dark:border-blue-700 pl-3 py-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{p.project}</span>
                          <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full text-xs">{p.status}</span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{p.details}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {minute.next_steps && (minute.next_steps as string[]).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                    <span className="text-base">➡️</span> Próximos pasos
                  </h3>
                  <ul className="space-y-1.5">
                    {(minute.next_steps as string[]).map((n, i) => (
                      <li key={i} className="text-sm text-slate-600 dark:text-slate-300 pl-4 relative before:content-['·'] before:absolute before:left-0 before:text-slate-300 dark:before:text-slate-600">
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {minute.discussion && (minute.discussion as any[]).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                    <span className="text-base">💬</span> Temas discutidos
                  </h3>
                  <div className="space-y-3">
                    {(minute.discussion as any[]).map((d, i) => (
                      <div key={i} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{d.topic}</p>
                        {d.speaker && <p className="text-xs text-slate-400 dark:text-slate-500">{d.speaker}</p>}
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 whitespace-pre-wrap">{d.details}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {minute.ideas && (minute.ideas as string[]).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                    <span className="text-base">💡</span> Ideas
                  </h3>
                  <ul className="space-y-1.5">
                    {(minute.ideas as string[]).map((idea, i) => (
                      <li key={i} className="text-sm text-slate-500 dark:text-slate-400 pl-4 relative before:content-['·'] before:absolute before:left-0 before:text-slate-300 dark:before:text-slate-600">
                        {idea}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {meeting.transcript_raw && (
            <details className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
              <summary className="text-sm font-medium text-slate-500 dark:text-slate-400 cursor-pointer select-none flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Transcripción completa
              </summary>
              <pre className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap mt-4 glass rounded-xl p-4">{meeting.transcript_raw}</pre>
            </details>
          )}

          {/* Participants */}
          {meeting.status === 'completed' && participants.length > 0 && (
            <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
              <h2 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">Participantes</h2>
              <div className="flex flex-wrap gap-2">
                {participants.map((p) => (
                  <span key={p.email} className="glass rounded-full px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300">
                    {p.name}
                    <span className="text-slate-400 dark:text-slate-500 mx-1">·</span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs">{p.email}</span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Processing State — recovery in case the worker died without updating status */}
      {meeting.status === 'processing' && (
        <section className="glass-strong rounded-2xl p-6 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-600 dark:text-slate-300 font-medium">Procesando audio y generando minuta…</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Si esto no avanza después de varios minutos, puede reintentarse.
          </p>
          <RetryButton meetingId={meeting.id} />
        </section>
      )}

      {/* Failed State */}
      {meeting.status === 'failed' && (
        <section className="glass-strong rounded-2xl p-6 text-center space-y-4 border border-rose-200/50 dark:border-rose-800/40">
          <div className="w-12 h-12 gradient-error rounded-xl flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-rose-600 dark:text-rose-400 font-medium">La reunión falló durante el procesamiento</p>
          <RetryButton meetingId={meeting.id} />
        </section>
      )}

      {!minute && meeting.status === 'completed' && (
        <div className="glass-strong rounded-2xl p-8 text-center">
          <p className="text-slate-500 dark:text-slate-400">Minuta no disponible aún.</p>
        </div>
      )}
    </div>
  );
}
