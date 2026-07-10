import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import AssignActionItems from '@/components/minutes/AssignActionItems';
import DeleteMeetingButton from '@/components/DeleteMeetingButton';
import RetryButton from '@/components/RetryButton';
import { StatusBadge } from '@/components/StatusBadge';
import { PriorityBadge } from '@/components/PriorityBadge';

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

  // Debug: log data issues
  console.log('Meeting detail debug:', {
    meetingId: params.id,
    meetingStatus: meeting?.status,
    hasMinute: !!minute,
    actionItemsCount: actionItems?.length || 0,
    actionItemsError: actionItemsResult.error?.message,
    participantsCount: participantsRaw?.length || 0,
  });

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
            </h2>
            <div>
              <h3 className="font-medium text-sm text-slate-500 dark:text-slate-400 mb-1">Resumen</h3>
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{minute.summary}</p>
            </div>
          </section>

          {minute.discussion && (minute.discussion as any[]).length > 0 && (
            <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                  </svg>
                </div>
                Temas Discutidos
              </h2>
              <div className="space-y-4">
                {(minute.discussion as any[]).map((d, i) => (
                  <div key={i} className="border-l-4 border-blue-400 pl-4 py-1">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{d.topic}</h3>
                    {d.speaker && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Liderado por: {d.speaker}</p>}
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap leading-relaxed">{d.details}</p>
                  </div>
                ))}
              </div>
            </section>
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

          {minute.project_statuses && (minute.project_statuses as any[]).length > 0 && (
            <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                Estados de Proyectos
              </h2>
              <div className="space-y-3">
                {(minute.project_statuses as any[]).map((p, i) => (
                  <div key={i} className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{p.project}</h3>
                      <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full text-xs font-medium">{p.status}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{p.details}</p>
                  </div>
                ))}
              </div>
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

          {minute.ideas && (minute.ideas as string[]).length > 0 && (
            <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-300 dark:bg-blue-600 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                Ideas / Brainstorming
              </h2>
              <ul className="space-y-2">
                {(minute.ideas as string[]).map((idea, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-600 dark:text-slate-300 text-sm">
                    <svg className="w-4 h-4 text-blue-400 mt-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    {idea}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {minute.next_steps && (minute.next_steps as string[]).length > 0 && (
            <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
                Próximos Pasos
              </h2>
              <ul className="space-y-2">
                {(minute.next_steps as string[]).map((n, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-600 dark:text-slate-300 text-sm">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">{i + 1}</span>
                    {n}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {meeting.transcript_raw && (
            <details className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
              <summary className="text-lg font-semibold text-slate-900 dark:text-slate-100 cursor-pointer select-none flex items-center gap-2">
                <svg className="w-5 h-5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Transcripción completa
              </summary>
              <pre className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap mt-4 glass rounded-xl p-4">{meeting.transcript_raw}</pre>
            </details>
          )}
        </>
      )}

      {/* Action Items */}
      {actionItems && actionItems.length > 0 && (
        <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            Responsabilidades
          </h2>
          <div className="space-y-3">
            {actionItems.map((item) => (
              <div key={item.id} className="glass rounded-xl p-4 hover:shadow-elevated transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{item.description}</p>
                    <div className="flex items-center gap-3 mt-2">
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
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      item.status === 'completado' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : item.status === 'en_progreso' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {item.status === 'completado' ? 'completado' : item.status === 'en_progreso' ? 'en progreso' : 'pendiente'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* No action items message */}
      {(!actionItems || actionItems.length === 0) && minute && meeting.status === 'completed' && (
        <div className="glass-strong rounded-2xl p-6 text-center">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">No se generaron action items para esta reunión</p>
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">El LLM no detectó compromisos específicos en la transcripción</p>
        </div>
      )}

      {/* Assign Action Items - show whenever there are unassigned items and participants */}
      {actionItems && actionItems.length > 0 && participants.length > 0 && (
        <AssignActionItems meetingId={meeting.id} actionItems={actionItems} participants={participants} />
      )}

      {/* Participants */}
      {meeting.status === 'completed' && participants.length > 0 && (
        <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Participantes</h2>
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