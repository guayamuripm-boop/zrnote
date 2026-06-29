import type { ActionItem } from '@zrnote/types';

interface ActionItemsTableProps {
  items: ActionItem[];
}

export default function ActionItemsTable({ items }: ActionItemsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2 font-medium">Responsable</th>
            <th className="py-2 font-medium">Tarea</th>
            <th className="py-2 font-medium">Fecha</th>
            <th className="py-2 font-medium">Prioridad</th>
            <th className="py-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="py-2">{item.assignee_name}</td>
              <td className="py-2">{item.description}</td>
              <td className="py-2 text-gray-500">
                {item.due_date
                  ? new Date(item.due_date).toLocaleDateString('es-ES')
                  : '—'}
              </td>
              <td className="py-2">
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
              </td>
              <td className="py-2">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
