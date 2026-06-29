import { createServerSupabase } from '@/lib/supabase/server';

export default async function ActionItemsPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: actionItems } = await supabase
    .from('action_items')
    .select('*, meetings(title)')
    .eq('assignee_user_id', user?.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mis Tareas Pendientes</h1>
      {actionItems && actionItems.length > 0 ? (
        <div className="bg-white rounded-lg border divide-y">
          {actionItems.map((item: any) => (
            <div key={item.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.description}</p>
                  <p className="text-sm text-gray-500">
                    {item.meetings?.title}
                    {item.due_date && ` · ${new Date(item.due_date).toLocaleDateString('es-ES')}`}
                  </p>
                </div>
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
