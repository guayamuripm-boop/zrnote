const statusStyles: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
  processing: 'bg-amber-50 text-amber-700 border border-amber-200/60',
  failed: 'bg-rose-50 text-rose-700 border border-rose-200/60',
  scheduled: 'bg-blue-50 text-blue-700 border border-blue-200/60',
};

const darkStatusStyles: Record<string, string> = {
  completed: 'dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/40',
  processing: 'dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/40',
  failed: 'dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/40',
  scheduled: 'dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/40',
};

const statusLabels: Record<string, string> = {
  completed: 'completado',
  processing: 'procesando',
  failed: 'fallido',
  scheduled: 'programado',
};

const statusDots: Record<string, string> = {
  completed: 'bg-emerald-500',
  processing: 'bg-amber-500 animate-pulse',
  failed: 'bg-rose-500',
  scheduled: 'bg-blue-500',
};

const darkStatusDots: Record<string, string> = {
  completed: 'dark:bg-emerald-400',
  processing: 'dark:bg-amber-400',
  failed: 'dark:bg-rose-400',
  scheduled: 'dark:bg-blue-400',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        statusStyles[status] || 'bg-gray-100 text-gray-600'
      } ${darkStatusStyles[status] || 'dark:bg-gray-800 dark:text-gray-400'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${statusDots[status] || 'bg-gray-400'} ${darkStatusDots[status] || ''}`} />
      {statusLabels[status] || status}
    </span>
  );
}