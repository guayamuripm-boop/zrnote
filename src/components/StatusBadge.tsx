const statusStyles: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-600 border border-emerald-200/50',
  processing: 'bg-amber-50 text-amber-600 border border-amber-200/50',
  failed: 'bg-rose-50 text-rose-600 border border-rose-200/50',
  scheduled: 'bg-indigo-50 text-indigo-600 border border-indigo-200/50',
};

const statusLabels: Record<string, string> = {
  completed: 'completado',
  processing: 'procesando',
  failed: 'fallido',
  scheduled: 'programado',
};

const statusDots: Record<string, string> = {
  completed: 'bg-emerald-400',
  processing: 'bg-amber-400 animate-pulse',
  failed: 'bg-rose-400',
  scheduled: 'bg-indigo-400',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium font-poppins ${
        statusStyles[status] || 'bg-gray-50 text-gray-600 border border-gray-200/50'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${statusDots[status] || 'bg-gray-400'}`} />
      {statusLabels[status] || status}
    </span>
  );
}
