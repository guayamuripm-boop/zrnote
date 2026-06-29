import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';

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
            <Link
              href={`/meetings/${meeting.id}/record`}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition"
            >
              Grabar
            </Link>
          )}
        </div>
      </div>

      {minute && (
        <section className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Minuta</h2>
          <div>
            <h3 className="font-medium text-sm text-gray-500 mb-1">Resumen</h3>
            <p>{minute.summary}</p>
          </div>
          {minute.decisions && minute.decisions.length > 0 && (
            <div>
              <h3 className="font-medium text-sm text-gray-500 mb-1">Decisiones</h3>
              <ul className="list-disc list-inside space-y-1">
                {(minute.decisions as string[]).map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {minute.changes && minute.changes.length > 0 && (
            <div>
              <h3 className="font-medium text-sm text-gray-500 mb-1">Cambios</h3>
              <ul className="list-disc list-inside space-y-1">
                {(minute.changes as string[]).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {minute.next_steps && minute.next_steps.length > 0 && (
            <div>
              <h3 className="font-medium text-sm text-gray-500 mb-1">Próximos pasos</h3>
              <ul className="list-disc list-inside space-y-1">
                {(minute.next_steps as string[]).map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
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

      {!minute && meeting.status === 'completed' && (
        <p className="text-gray-500">Minuta no disponible aún.</p>
      )}
    </div>
  );
}
