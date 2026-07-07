const statusStyles: Record<string, string> = {
  completed: 'bg-indigo-50 text-indigo-600 border border-indigo-200/50',
  processing: 'bg-indigo-100/50 text-indigo-700 border border-indigo-200/50',
  failed: 'bg-indigo-800/10 text-indigo-800 border border-indigo-800/20',
  scheduled: 'bg-indigo-50 text-indigo-600 border border-indigo-200/50',
};

const statusLabels: Record<string, string> = {
  completed: 'completado',
  processing: 'procesando',
  failed: 'fallido',
  scheduled: 'programado',
};

const statusDots: Record<string, string> = {
  completed: 'bg-indigo-500',
  processing: 'bg-indigo-400 animate-pulse',
  failed: 'bg-indigo-700',
  scheduled: 'bg-indigo-400',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        statusStyles[status] || 'bg-gray-50 text-gray-600 border border-gray-200/50'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${statusDots[status] || 'bg-gray-400'}`} />
      {statusLabels[status] || status}
    </span>
  );
}
