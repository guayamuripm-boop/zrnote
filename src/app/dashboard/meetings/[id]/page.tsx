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
    .select('*')
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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{meeting.title}</h1>
          <p className="text-gray-500">
            {meeting.coordination && `${meeting.coordination} · `}
            {new Date(meeting.created_at).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={meeting.status} />
          {meeting.status === 'scheduled' && (
            <div className="flex items-center gap-2">
              <Link
                href={`/dashboard/meetings/${meeting.id}/record`}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition"
              >
                Grabar
              </Link>
              <Link
                href={`/dashboard/meetings/${meeting.id}/upload`}
                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Subir Audio
              </Link>
            </div>
          )}
          <DeleteMeetingButton meetingId={meeting.id} />
        </div>
      </div>

      {minute && (
        <>
          <section className="bg-white rounded-lg border p-6 space-y-4">
            <h2 className="text-lg font-semibold">Minuta</h2>
            <div>
              <h3 className="font-medium text-sm text-gray-500 mb-1">Resumen</h3>
              <p className="whitespace-pre-wrap">{minute.summary}</p>
            </div>
          </section>

          {minute.discussion && (minute.discussion as any[]).length > 0 && (
            <section className="bg-white rounded-lg border p-6 space-y-4">
              <h2 className="text-lg font-semibold">Temas Discutidos</h2>
              <div className="space-y-4">
                {(minute.discussion as any[]).map((d, i) => (
                  <div key={i} className="border-l-4 border-zr-blue pl-4">
                    <h3 className="font-medium">{d.topic}</h3>
                    {d.speaker && <p className="text-xs text-gray-400 mb-1">Liderado por: {d.speaker}</p>}
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{d.details}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {minute.decisions && (minute.decisions as string[]).length > 0 && (
            <section className="bg-white rounded-lg border p-6 space-y-4">
              <h2 className="text-lg font-semibold">Decisiones</h2>
              <ul className="list-disc list-inside space-y-1">
                {(minute.decisions as string[]).map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </section>
          )}

          {minute.project_statuses && (minute.project_statuses as any[]).length > 0 && (
            <section className="bg-white rounded-lg border p-6 space-y-4">
              <h2 className="text-lg font-semibold">Estados de Proyectos</h2>
              <div className="space-y-3">
                {(minute.project_statuses as any[]).map((p, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{p.project}</h3>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">{p.status}</span>
                    </div>
                    <p className="text-sm text-gray-600">{p.details}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {minute.blockers && (minute.blockers as any[]).length > 0 && (
            <section className="bg-white rounded-lg border p-6 space-y-4">
              <h2 className="text-lg font-semibold">Bloqueos / Problemas</h2>
              <div className="space-y-3">
                {(minute.blockers as any[]).map((b, i) => (
                  <div key={i} className="bg-red-50 rounded-lg p-3">
                    <h3 className="font-medium text-red-800">{b.issue}</h3>
                    <p className="text-sm text-red-600">Impacto: {b.impact}</p>
                    {b.owner && <p className="text-xs text-gray-500">Responsable: {b.owner}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {minute.ideas && (minute.ideas as string[]).length > 0 && (
            <section className="bg-white rounded-lg border p-6 space-y-4">
              <h2 className="text-lg font-semibold">Ideas / Brainstorming</h2>
              <ul className="list-disc list-inside space-y-1">
                {(minute.ideas as string[]).map((idea, i) => (
                  <li key={i}>{idea}</li>
                ))}
              </ul>
            </section>
          )}

          {minute.next_steps && (minute.next_steps as string[]).length > 0 && (
            <section className="bg-white rounded-lg border p-6 space-y-4">
              <h2 className="text-lg font-semibold">Próximos Pasos</h2>
              <ul className="list-disc list-inside space-y-1">
                {(minute.next_steps as string[]).map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}

          {meeting.transcript_raw && (
            <details className="bg-white rounded-lg border p-6 space-y-4">
              <summary className="text-lg font-semibold cursor-pointer">Transcripción completa</summary>
              <pre className="text-sm text-gray-600 whitespace-pre-wrap mt-2">{meeting.transcript_raw}</pre>
            </details>
          )}
        </>
      )}

      {actionItems && actionItems.length > 0 && (
        <section className="bg-white rounded-lg border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Responsabilidades</h2>
            <span className="text-sm text-gray-500">
              {new Date(meeting.created_at).toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>
          <div className="space-y-3">
            {actionItems.map((item) => (
              <div
                key={item.id}
                className="border border-gray-100 rounded-xl p-4 hover:border-blue-200 hover:bg-blue-50/30 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{item.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="inline-flex items-center gap-1 text-sm text-gray-500">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {item.assignee_name || 'Sin asignar'}
                      </span>
                      {item.due_date && (
                        <span className="inline-flex items-center gap-1 text-sm text-gray-400">
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
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        item.status === 'completado'
                          ? 'bg-green-100 text-green-700'
                          : item.status === 'en_progreso'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {item.status === 'completado' ? 'completado' : item.status === 'en_progreso' ? 'en progreso' : 'pendiente'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {meeting.status === 'completed' && actionItems && actionItems.length > 0 && participants.length > 0 && (
        <AssignActionItems
          meetingId={meeting.id}
          actionItems={actionItems}
          participants={participants}
        />
      )}

      {meeting.status === 'completed' && participants.length > 0 && (
        <section className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Participantes</h2>
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <span key={p.email} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">
                {p.name} <span className="text-gray-400">·</span> {p.email}
              </span>
            ))}
          </div>
        </section>
      )}

      {meeting.status === 'failed' && (
        <section className="bg-red-50 border border-red-200 rounded-lg p-6 text-center space-y-3">
          <p className="text-red-800 font-medium">La reunión falló durante el procesamiento</p>
          <RetryButton meetingId={meeting.id} />
        </section>
      )}

      {!minute && meeting.status === 'completed' && (
        <p className="text-gray-500">Minuta no disponible aún.</p>
      )}
    </div>
  );
}
