import { createServerSupabase } from '@/lib/supabase/server';

export default async function ActionItemsPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: actionItems } = await supabase
    .from('action_items')
    .select('*')
    .eq('assignee_user_id', user?.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mis Tareas</h1>
      {actionItems && actionItems.length > 0 ? (
        <div className="bg-white rounded-lg border divide-y">
          {actionItems.map((item) => (
            <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{item.description}</p>
                <p className="text-sm text-gray-500">
                  {item.due_date && `Fecha: ${new Date(item.due_date).toLocaleDateString('es-ES')}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
      ) : (
        <p className="text-gray-500">No tienes tareas pendientes.</p>
      )}
    </div>
  );
}
