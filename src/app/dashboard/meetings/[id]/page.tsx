import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import AssignActionItems from '@/components/minutes/AssignActionItems';
import DeleteMeetingButton from '@/components/DeleteMeetingButton';

export default async function MeetingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();

  const { data: meeting } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!meeting) notFound();

  const { data: minute } = await supabase
    .from('minutes')
    .select('*')
    .eq('meeting_id', params.id)
    .single();

  const { data: actionItems } = await supabase
    .from('action_items')
    .select('*')
    .eq('meeting_id', params.id)
    .order('priority', { ascending: true });

  const { data: participantsRaw } = await supabase
    .from('meeting_participants')
    .select('*')
    .eq('meeting_id', params.id);

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
          <span
            className={`px-3 py-1 rounded text-sm font-medium ${
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
          <h2 className="text-lg font-semibold">Action Items</h2>
          <div className="divide-y">
            {actionItems.map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.description}</p>
                  <p className="text-sm text-gray-500">
                    {item.assignee_name}
                    {item.due_date && ` · ${new Date(item.due_date).toLocaleDateString('es-ES')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      item.priority === 'alta'
                        ? 'bg-red-100 text-red-700'
                        : item.priority === 'media'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {item.priority}
                  </span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      item.status === 'completado'
                        ? 'bg-green-100 text-green-700'
                        : item.status === 'en_progreso'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {item.status}
                  </span>
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

      {!minute && meeting.status === 'completed' && (
        <p className="text-gray-500">Minuta no disponible aún.</p>
      )}
    </div>
  );
}
