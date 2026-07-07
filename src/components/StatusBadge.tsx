const statusStyles: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  processing: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  scheduled: 'bg-gray-100 text-gray-700',
};

const statusLabels: Record<string, string> = {
  completed: 'completado',
  processing: 'procesando',
  failed: 'fallido',
  scheduled: 'programado',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
        statusStyles[status] || 'bg-gray-100 text-gray-700'
      }`}
    >
      {statusLabels[status] || status}
    </span>
  );
}
